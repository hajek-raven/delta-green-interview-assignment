import type { Snapshot } from "../car/snapshot";

export interface SnapshotStore {
  insert(snapshot: Snapshot): Promise<void>;
  close(): Promise<void>;
}
