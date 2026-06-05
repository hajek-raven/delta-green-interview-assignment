import { CAR_ID } from "../lib/config";
import { type Snapshot, snapshotSchema } from "./snapshot";

// Stop emitting when the upstream source has been silent long enough to be stale.
const STALE_MS = 15_000;
const METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR = 3.6;

type BatteryState = {
  soc?: number;
  capacity?: number;
};

type CarState = {
  latitude?: number;
  longitude?: number;
  speed?: number;
  gear: string;
  batteries: Map<number, BatteryState>;
  lastSeenAt?: number;
};

export type SnapshotResult =
  | { kind: "snapshot"; snapshot: Snapshot; recovered: boolean }
  | { kind: "stale"; changed: boolean }
  | { kind: "incomplete"; recovered: boolean };

export function createCarState() {
  const state: CarState = {
    gear: "N",
    batteries: new Map(),
  };
  let sourceStale = true;

  return {
    applyMessage(topic: string, value: number | string, now: number) {
      updateState(state, topic, value);
      state.lastSeenAt = now;
    },

    buildSnapshot(bucket: number, now: number): SnapshotResult {
      const stale = !state.lastSeenAt || now - state.lastSeenAt > STALE_MS;
      if (stale) {
        const changed = stale !== sourceStale;
        sourceStale = stale;
        return { kind: "stale", changed };
      }

      const recovered = sourceStale;
      sourceStale = false;

      const stateOfCharge = calculateStateOfCharge(state.batteries);
      if (
        state.latitude === undefined ||
        state.longitude === undefined ||
        state.speed === undefined ||
        stateOfCharge === undefined
      ) {
        return { kind: "incomplete", recovered };
      }

      return {
        kind: "snapshot",
        recovered,
        snapshot: snapshotSchema.parse({
          carId: CAR_ID,
          time: new Date(bucket).toISOString(),
          stateOfCharge,
          latitude: state.latitude,
          longitude: state.longitude,
          gear: normalizeGear(state.gear),
          speed: state.speed * METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR,
        }),
      };
    },
  };
}

function updateState(state: CarState, topic: string, value: number | string) {
  const parts = topic.split("/");

  if (parts[0] !== "car" || parts[1] !== String(CAR_ID)) {
    return;
  }

  if (parts[2] === "location" && parts[3] === "latitude") {
    setNumber(value, (number) => (state.latitude = number));
    return;
  }

  if (parts[2] === "location" && parts[3] === "longitude") {
    setNumber(value, (number) => (state.longitude = number));
    return;
  }

  if (parts[2] === "speed") {
    setNumber(value, (number) => (state.speed = number));
    return;
  }

  if (parts[2] === "gear") {
    state.gear = String(value);
    return;
  }

  if (parts[2] === "battery") {
    const batteryIndex = Number(parts[3]);
    const field = parts[4];
    if (!Number.isInteger(batteryIndex) || (field !== "soc" && field !== "capacity")) {
      return;
    }

    const battery = state.batteries.get(batteryIndex) ?? {};
    setNumber(value, (number) => (battery[field] = number));
    state.batteries.set(batteryIndex, battery);
  }
}

function setNumber(value: number | string, write: (value: number) => void) {
  const number = Number(value);
  if (Number.isFinite(number)) {
    write(number);
  }
}

function calculateStateOfCharge(batteries: Map<number, BatteryState>) {
  // Weighted average over every battery we have full data for. Capacity is static,
  // so once seen it is held and the average stays correct for later snapshots.
  let socWeighted = 0;
  let totalCapacity = 0;
  for (const { soc, capacity } of batteries.values()) {
    if (soc !== undefined && capacity !== undefined) {
      socWeighted += soc * capacity;
      totalCapacity += capacity;
    }
  }

  return totalCapacity === 0 ? undefined : Math.round(socWeighted / totalCapacity);
}

function normalizeGear(gear: string) {
  if (gear === "N") {
    return 0;
  }

  const number = Number(gear);
  return Number.isFinite(number) ? number : 0;
}
