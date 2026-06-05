import { connect as connectRabbit, type ChannelModel, type ConfirmChannel } from "amqplib";

const RECONNECT_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type RabbitHandle = { stop: () => Promise<void> };

// Keeps a RabbitMQ connection alive: runs `onChannel` once connected and reconnects
// with backoff whenever the connection drops, until `stop()` is called.
export function runRabbit(opts: {
  url: string;
  onChannel: (channel: ConfirmChannel) => Promise<void>;
  onLost?: () => void;
}): RabbitHandle {
  let stopped = false;
  let connection: ChannelModel | null = null;

  async function loop() {
    while (!stopped) {
      try {
        connection = await connectRabbit(opts.url);
      } catch (error) {
        console.error("RabbitMQ connect failed, retrying", error);
        await sleep(RECONNECT_MS);
        continue;
      }

      const closed = new Promise<void>((resolve) => {
        connection!.once("close", () => resolve());
        connection!.on("error", (error) => console.error("RabbitMQ error", error));
      });

      try {
        const channel = await connection.createConfirmChannel();
        await opts.onChannel(channel);
      } catch (error) {
        console.error("RabbitMQ channel setup failed, will reconnect", error);
        try {
          await connection.close();
        } catch {
          // ignore
        }
      }

      await closed;
      connection = null;
      opts.onLost?.();
      if (!stopped) {
        console.error("RabbitMQ connection lost, reconnecting...");
        await sleep(RECONNECT_MS);
      }
    }
  }

  void loop();

  return {
    stop: async () => {
      stopped = true;
      if (connection) {
        try {
          await connection.close();
        } catch {
          // ignore
        }
      }
    },
  };
}

// sendToQueue on a confirm channel, resolving only once the broker confirms the
// message is safely persisted. Lets callers publish-then-ack without losing data.
export function publishConfirmed(
  channel: ConfirmChannel,
  queue: string,
  content: Buffer,
  options: Parameters<ConfirmChannel["sendToQueue"]>[2],
): Promise<void> {
  return new Promise((resolve, reject) => {
    channel.sendToQueue(queue, content, options, (error) => (error ? reject(error) : resolve()));
  });
}
