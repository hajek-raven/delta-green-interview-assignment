export const CAR_ID = 1;
export const SAMPLE_MS = 5_000;

export const QUEUE = "car_state_snapshots";
export const RETRY_QUEUE = "car_state_snapshots.retry";
export const DLQ = "car_state_snapshots.dlq";
export const RETRY_DELAY_MS = 5_000;
export const MAX_ATTEMPTS = 5;
