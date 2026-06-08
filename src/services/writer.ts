import type { SnapshotStore } from "../contracts/store";
import type { SnapshotConsumer } from "../contracts/queue";
import { logSnapshot } from "../lib/log";

type WriterDeps = {
  readonly consumer: SnapshotConsumer;
  readonly store: SnapshotStore;
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
};

export function createWriter({
  consumer,
  store,
  maxAttempts,
  retryDelayMs,
}: WriterDeps) {
  return {
    run() {
      return consumer.run(async (snapshot, { attempt }) => {
        try {
          await store.insert(snapshot);
          logSnapshot("Inserted snapshot", snapshot);
          return { kind: "ack" };
        } catch (error) {
          if (attempt >= maxAttempts) {
            console.error(`Insert failed ${attempt}x -> DLQ`, error);
            return { kind: "deadLetter", reason: insertFailedReason(error) };
          }

          console.error(
            `Insert failed (attempt ${attempt}) -> retry in ${retryDelayMs}ms`,
            error,
          );
          return { kind: "retry" };
        }
      });
    },

    async stop() {
      await consumer.close();
      await store.close();
    },
  };
}

function insertFailedReason(error: unknown): `insert_failed:${string}` {
  return `insert_failed:${String(error)}`;
}
