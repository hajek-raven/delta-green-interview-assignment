import { createDrizzleSnapshotStore } from "./adapters/drizzle-snapshot-store";
import { createRabbitSnapshotConsumer } from "./adapters/rabbit-queue-consumer";
import { ensureDbSetup } from "./db/setup";
import {
  DLQ,
  MAX_ATTEMPTS,
  QUEUE,
  RETRY_DELAY_MS,
  RETRY_QUEUE,
} from "./lib/config";
import { RABBITMQ_URL } from "./lib/env";
import { onShutdown } from "./lib/shutdown";
import { createWriter } from "./services/writer";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  await ensureDbSetup();

  const store = createDrizzleSnapshotStore();
  const consumer = createRabbitSnapshotConsumer({
    url: RABBITMQ_URL,
    queue: QUEUE,
    retryQueue: RETRY_QUEUE,
    dlq: DLQ,
    retryDelayMs: RETRY_DELAY_MS,
    maxAttempts: MAX_ATTEMPTS,
  });
  const writer = createWriter({
    consumer,
    store,
    maxAttempts: MAX_ATTEMPTS,
    retryDelayMs: RETRY_DELAY_MS,
  });

  onShutdown(() => writer.stop());

  await writer.run();
}
