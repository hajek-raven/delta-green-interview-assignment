import { DLQ, MAX_ATTEMPTS, QUEUE, RETRY_DELAY_MS, RETRY_QUEUE } from "../lib/config";

export type RabbitPublisherConfig = {
  readonly url: string;
  readonly queue: typeof QUEUE;
};

export type RabbitConsumerConfig = {
  readonly url: string;
  readonly queue: typeof QUEUE;
  readonly retryQueue: typeof RETRY_QUEUE;
  readonly dlq: typeof DLQ;
  readonly retryDelayMs: typeof RETRY_DELAY_MS;
  readonly maxAttempts: typeof MAX_ATTEMPTS;
};
