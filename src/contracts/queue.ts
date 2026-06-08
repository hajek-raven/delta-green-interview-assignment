import type { Snapshot } from "../car/snapshot";

export type DeliveryOutcome =
  | { readonly kind: "ack" }
  | { readonly kind: "retry" }
  | { readonly kind: "deadLetter"; readonly reason: DeadLetterReason };

export type DeadLetterReason = "unparseable" | `insert_failed:${string}`;

export type DeliveryMeta = {
  readonly attempt: number;
};

export interface QueuePublisher<TMessage> {
  publish(message: TMessage): Promise<void>;
  close(): Promise<void>;
}

export interface QueueConsumer<TMessage> {
  run(
    handler: (message: TMessage, meta: DeliveryMeta) => Promise<DeliveryOutcome>,
  ): Promise<void>;
  close(): Promise<void>;
}

export type SnapshotPublisher = QueuePublisher<Snapshot>;
export type SnapshotConsumer = QueueConsumer<Snapshot>;
