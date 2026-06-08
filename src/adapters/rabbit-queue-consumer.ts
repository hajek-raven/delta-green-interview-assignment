import { type ConfirmChannel, type ConsumeMessage } from "amqplib";

import { decodeSnapshot } from "../car/codec";
import {
  type DeadLetterReason,
  type DeliveryMeta,
  type DeliveryOutcome,
} from "../contracts/queue";
import type { SnapshotConsumer } from "../contracts/queue";
import { publishConfirmed, runRabbit, type RabbitHandle } from "../lib/rabbit";
import type { RabbitConsumerConfig } from "./rabbit-config";

export function createRabbitSnapshotConsumer(
  config: RabbitConsumerConfig,
): SnapshotConsumer {
  let inFlight: Promise<void> = Promise.resolve();
  let consumer: { channel: ConfirmChannel; tag: string } | null = null;
  let rabbit: RabbitHandle | null = null;
  let stopResolve: (() => void) | undefined;

  return {
    async run(handler) {
      const stopped = new Promise<void>((resolve) => {
        stopResolve = resolve;
      });

      rabbit = runRabbit({
        url: config.url,
        onChannel: async (channel) => {
          await setupTopology(channel, config);
          await channel.prefetch(1);
          const { consumerTag } = await channel.consume(
            config.queue,
            (message) => {
              inFlight = processMessage(channel, message, handler, config);
            },
          );
          consumer = { channel, tag: consumerTag };
          console.log(`Connected to RabbitMQ, consuming from ${config.queue}`);
        },
        onLost: () => {
          consumer = null;
        },
      });

      await stopped;
    },
    async close() {
      if (consumer) {
        try {
          await consumer.channel.cancel(consumer.tag);
        } catch {
          // ignore
        }
      }
      await inFlight;
      await rabbit?.stop();
      stopResolve?.();
    },
  };
}

async function setupTopology(
  channel: ConfirmChannel,
  config: RabbitConsumerConfig,
) {
  await channel.assertQueue(config.queue, { durable: true });
  await channel.assertQueue(config.dlq, { durable: true });
  await channel.assertQueue(config.retryQueue, {
    durable: true,
    arguments: {
      "x-message-ttl": config.retryDelayMs,
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": config.queue,
    },
  });
}

async function processMessage(
  channel: ConfirmChannel,
  message: ConsumeMessage | null,
  handler: Parameters<SnapshotConsumer["run"]>[0],
  config: RabbitConsumerConfig,
) {
  if (!message) {
    return;
  }

  const decoded = decodeSnapshot(message.content);
  if (!decoded.ok) {
    console.error("Unparseable message -> DLQ", decoded.error);
    await applyOutcome(
      channel,
      message,
      { kind: "deadLetter", reason: "unparseable" },
      config,
    );
    return;
  }

  const attempt = normalizeAttempt(message);
  const meta: DeliveryMeta = { attempt };

  try {
    const outcome = await handler(decoded.value, meta);
    await applyOutcome(channel, message, outcome, config);
  } catch (error) {
    const outcome: DeliveryOutcome =
      attempt >= config.maxAttempts
        ? { kind: "deadLetter", reason: `insert_failed:${String(error)}` }
        : { kind: "retry" };
    await applyOutcome(channel, message, outcome, config, error);
  }
}

function normalizeAttempt(message: ConsumeMessage): number {
  const raw = Number(message.properties.headers?.["x-attempts"]) || 0;
  return raw + 1;
}

async function applyOutcome(
  channel: ConfirmChannel,
  message: ConsumeMessage,
  outcome: DeliveryOutcome,
  config: RabbitConsumerConfig,
  processingError?: unknown,
) {
  try {
    await dispatchOutcome(channel, message, outcome, config, processingError);
    channel.ack(message);
  } catch (publishError) {
    console.error(
      "Failed to route message to retry/DLQ, requeueing",
      publishError,
    );
    try {
      channel.nack(message, false, true);
    } catch {
      // ignore
    }
  }
}

async function dispatchOutcome(
  channel: ConfirmChannel,
  message: ConsumeMessage,
  outcome: DeliveryOutcome,
  config: RabbitConsumerConfig,
  processingError?: unknown,
) {
  switch (outcome.kind) {
    case "ack":
      return;
    case "retry": {
      const attempt = normalizeAttempt(message);
      if (processingError) {
        console.error(
          `Insert failed (attempt ${attempt}) -> retry in ${config.retryDelayMs}ms`,
          processingError,
        );
      }
      await publishConfirmed(channel, config.retryQueue, message.content, {
        persistent: true,
        headers: { ...message.properties.headers, "x-attempts": attempt },
      });
      return;
    }
    case "deadLetter": {
      const attempt = normalizeAttempt(message);
      if (processingError) {
        console.error(`Insert failed ${attempt}x -> DLQ`, processingError);
      }
      await deadLetter(channel, message, outcome.reason, config);
      return;
    }
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

function deadLetter(
  channel: ConfirmChannel,
  message: ConsumeMessage,
  reason: DeadLetterReason,
  config: RabbitConsumerConfig,
) {
  return publishConfirmed(channel, config.dlq, message.content, {
    persistent: true,
    headers: { ...message.properties.headers, "x-death-reason": reason },
  });
}
