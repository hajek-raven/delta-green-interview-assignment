import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { snapshotJsonCodec, snapshotSchema, type Snapshot } from "../src/car/snapshot";

const validSnapshot: Snapshot = {
  carId: 1,
  time: "2026-06-04T09:00:00.000Z",
  stateOfCharge: 67,
  latitude: 50.1,
  longitude: 14.4,
  gear: 3,
  speed: 36,
};

describe("snapshotSchema", () => {
  it("accepts a valid car state snapshot", () => {
    expect(snapshotSchema.parse(validSnapshot)).toEqual(validSnapshot);
  });

  it("rejects values that cannot be written as valid car_state rows", () => {
    expect(snapshotSchema.safeParse({ ...validSnapshot, stateOfCharge: 101 }).success).toBe(false);
    expect(snapshotSchema.safeParse({ ...validSnapshot, gear: 7 }).success).toBe(false);
    expect(snapshotSchema.safeParse({ ...validSnapshot, speed: -1 }).success).toBe(false);
    expect(snapshotSchema.safeParse({ ...validSnapshot, time: "not-a-date" }).success).toBe(false);
  });
});

describe("snapshotJsonCodec", () => {
  it("decodes a JSON message into a snapshot", () => {
    expect(snapshotJsonCodec.parse(JSON.stringify(validSnapshot))).toEqual(validSnapshot);
  });

  it("encodes a snapshot for RabbitMQ payloads", () => {
    expect(z.encode(snapshotJsonCodec, validSnapshot)).toBe(JSON.stringify(validSnapshot));
  });

  it("rejects invalid JSON payloads", () => {
    expect(snapshotJsonCodec.safeParse(JSON.stringify({ ...validSnapshot, gear: 9 })).success).toBe(
      false,
    );
    expect(snapshotJsonCodec.safeParse("not json").success).toBe(false);
  });
});
