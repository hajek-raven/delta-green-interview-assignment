export type RabbitPublisherConfig = {
  readonly url: string;
  readonly queue: string;
};

export type RabbitConsumerConfig = {
  readonly url: string;
  readonly queue: string;
  readonly retryQueue: string;
  readonly dlq: string;
  readonly retryDelayMs: number;
  readonly maxAttempts: number;
};
