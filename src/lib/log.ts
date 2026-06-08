import type { Snapshot } from "../car/snapshot";

export function logSnapshot(action: string, snapshot: Snapshot) {
  console.log(
    `${action} car=${snapshot.carId} time=${snapshot.time} soc=${snapshot.stateOfCharge}% gear=${snapshot.gear} speed=${snapshot.speed.toFixed(1)}km/h`,
  );
}
