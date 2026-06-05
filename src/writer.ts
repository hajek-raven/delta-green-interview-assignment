import { createDrizzleSnapshotStore } from "./adapters/drizzle-snapshot-store";
import { createRabbitSnapshotConsumer } from "./adapters/rabbit-queue-consumer";
import { insertFailedReason } from "./contracts/queue";
import { DLQ, MAX_ATTEMPTS, QUEUE, RETRY_DELAY_MS, RETRY_QUEUE } from "./lib/config";
import { RABBITMQ_URL } from "./lib/env";
import { onShutdown } from "./lib/shutdown";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const store = createDrizzleSnapshotStore();
  const consumer = createRabbitSnapshotConsumer({
    url: RABBITMQ_URL,
    queue: QUEUE,
    retryQueue: RETRY_QUEUE,
    dlq: DLQ,
    retryDelayMs: RETRY_DELAY_MS,
    maxAttempts: MAX_ATTEMPTS,
  });

  onShutdown(async () => {
    await consumer.close();
    await store.close();
  });

  await consumer.run(async (snapshot, { attempt }) => {
    try {
      await store.insert(snapshot);
      return { kind: "ack" };
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) {
        console.error(`Insert failed ${attempt}x -> DLQ`, error);
        return { kind: "deadLetter", reason: insertFailedReason(error) };
      }
      console.error(`Insert failed (attempt ${attempt}) -> retry in ${RETRY_DELAY_MS}ms`, error);
      return { kind: "retry" };
    }
  });
}
