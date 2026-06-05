import type { Snapshot } from "../car/snapshot";
import type { SnapshotStore } from "../contracts/store";
import { createDb } from "../db/db";
import { carState } from "../db/schema";

function toRow(snapshot: Snapshot) {
  return {
    carId: snapshot.carId,
    time: new Date(snapshot.time),
    stateOfCharge: snapshot.stateOfCharge,
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    gear: snapshot.gear,
    speed: snapshot.speed,
  };
}

export function createDrizzleSnapshotStore(): SnapshotStore {
  const { db, client } = createDb();

  return {
    async insert(snapshot) {
      await db
        .insert(carState)
        .values(toRow(snapshot))
        .onConflictDoNothing({ target: [carState.carId, carState.time] });
    },
    async close() {
      await client.close({ timeout: 5 });
    },
  };
}
