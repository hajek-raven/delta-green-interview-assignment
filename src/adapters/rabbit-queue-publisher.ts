import { type ConfirmChannel } from "amqplib";

import { encodeSnapshot } from "../car/codec";
import type { SnapshotPublisher } from "../contracts/queue";
import { publishConfirmed, runRabbit, type RabbitHandle } from "../lib/rabbit";
import type { RabbitPublisherConfig } from "./rabbit-config";

export function createRabbitSnapshotPublisher(
  config: RabbitPublisherConfig,
): SnapshotPublisher {
  let channel: ConfirmChannel | null = null;
  let rabbit: RabbitHandle | null = null;

  rabbit = runRabbit({
    url: config.url,
    onChannel: async (ch) => {
      await ch.assertQueue(config.queue, { durable: true });
      channel = ch;
      console.log(`Connected to RabbitMQ, publishing to ${config.queue}`);
    },
    onLost: () => {
      channel = null;
    },
  });

  return {
    async publish(snapshot) {
      if (!channel) {
        console.error("No RabbitMQ channel, skipping snapshot");
        return;
      }
      await publishConfirmed(channel, config.queue, encodeSnapshot(snapshot), {
        contentType: "application/json",
        persistent: true,
      });
    },
    async close() {
      if (channel) {
        try {
          await channel.waitForConfirms();
        } catch {
          // ignore
        }
      }
      await rabbit?.stop();
    },
  };
}
