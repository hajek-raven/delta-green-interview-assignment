import { describe, expect, it } from "vitest";

import { createCarState } from "../src/car/state";

function applyCompleteState(carState: ReturnType<typeof createCarState>, now: number) {
  carState.applyMessage("car/1/location/latitude", 50.1, now);
  carState.applyMessage("car/1/location/longitude", 14.4, now);
  carState.applyMessage("car/1/speed", 10, now);
  carState.applyMessage("car/1/gear", "N", now);
  carState.applyMessage("car/1/battery/0/soc", 80, now);
  carState.applyMessage("car/1/battery/0/capacity", 20_000, now);
  carState.applyMessage("car/1/battery/1/soc", 40, now);
  carState.applyMessage("car/1/battery/1/capacity", 10_000, now);
}

function applyLocationSpeed(carState: ReturnType<typeof createCarState>, now: number) {
  carState.applyMessage("car/1/location/latitude", 50.1, now);
  carState.applyMessage("car/1/location/longitude", 14.4, now);
  carState.applyMessage("car/1/speed", 10, now);
}

describe("createCarState", () => {
  it("builds a 5s bucket snapshot from out-of-sync car messages", () => {
    const carState = createCarState();

    applyCompleteState(carState, 1_000);

    const result = carState.buildSnapshot(5_000, 5_000);

    expect(result.kind).toBe("snapshot");
    if (result.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    expect(result.recovered).toBe(true);
    expect(result.snapshot).toEqual({
      carId: 1,
      time: "1970-01-01T00:00:05.000Z",
      stateOfCharge: 67,
      latitude: 50.1,
      longitude: 14.4,
      gear: 0,
      speed: 36,
    });
  });

  it("waits until location, speed and battery state are all available", () => {
    const carState = createCarState();

    carState.applyMessage("car/1/location/latitude", 50.1, 1_000);
    carState.applyMessage("car/1/location/longitude", 14.4, 1_000);
    carState.applyMessage("car/1/battery/0/soc", 80, 1_000);
    carState.applyMessage("car/1/battery/0/capacity", 20_000, 1_000);

    expect(carState.buildSnapshot(5_000, 5_000)).toEqual({
      kind: "incomplete",
      recovered: true,
    });
  });

  it("ignores messages for other cars and malformed battery topics", () => {
    const carState = createCarState();

    carState.applyMessage("car/2/location/latitude", 50.1, 1_000);
    carState.applyMessage("car/1/location/longitude", 14.4, 1_000);
    carState.applyMessage("car/1/speed", 10, 1_000);
    carState.applyMessage("car/1/battery/x/soc", 80, 1_000);
    carState.applyMessage("car/1/battery/0/capacity", 20_000, 1_000);

    expect(carState.buildSnapshot(5_000, 5_000)).toEqual({
      kind: "incomplete",
      recovered: true,
    });
  });

  it("keeps battery capacity after it has been observed", () => {
    const carState = createCarState();

    applyCompleteState(carState, 1_000);
    carState.buildSnapshot(5_000, 5_000);
    carState.applyMessage("car/1/battery/0/soc", 50, 6_000);
    carState.applyMessage("car/1/battery/1/soc", 20, 6_000);

    const result = carState.buildSnapshot(10_000, 10_000);

    expect(result.kind).toBe("snapshot");
    if (result.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    expect(result.recovered).toBe(false);
    expect(result.snapshot.stateOfCharge).toBe(40);
  });

  it("reports stale source once and marks the next snapshot as recovered", () => {
    const carState = createCarState();

    applyCompleteState(carState, 1_000);
    carState.buildSnapshot(5_000, 5_000);

    expect(carState.buildSnapshot(20_000, 20_000)).toEqual({
      kind: "stale",
      changed: true,
    });
    expect(carState.buildSnapshot(25_000, 25_000)).toEqual({
      kind: "stale",
      changed: false,
    });

    carState.applyMessage("car/1/speed", 12, 26_000);
    const result = carState.buildSnapshot(30_000, 30_000);

    expect(result.kind).toBe("snapshot");
    if (result.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    expect(result.recovered).toBe(true);
    expect(result.snapshot.speed).toBe(43.2);
  });

  it("keeps the last gear when no new gear message arrives", () => {
    const carState = createCarState();

    applyCompleteState(carState, 1_000);
    carState.applyMessage("car/1/gear", "4", 1_000);

    const first = carState.buildSnapshot(5_000, 5_000);
    expect(first.kind).toBe("snapshot");
    if (first.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    expect(first.snapshot.gear).toBe(4);

    const second = carState.buildSnapshot(10_000, 10_000);
    expect(second.kind).toBe("snapshot");
    if (second.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    expect(second.snapshot.gear).toBe(4);
  });

  it("waits for delayed speed before emitting a snapshot", () => {
    const carState = createCarState();

    carState.applyMessage("car/1/location/latitude", 50.1, 1_000);
    carState.applyMessage("car/1/location/longitude", 14.4, 1_000);
    carState.applyMessage("car/1/battery/0/soc", 80, 1_000);
    carState.applyMessage("car/1/battery/0/capacity", 20_000, 1_000);
    carState.applyMessage("car/1/battery/1/soc", 40, 1_000);
    carState.applyMessage("car/1/battery/1/capacity", 10_000, 1_000);

    expect(carState.buildSnapshot(5_000, 5_000)).toEqual({
      kind: "incomplete",
      recovered: true,
    });

    carState.applyMessage("car/1/speed", 10, 6_000);
    const result = carState.buildSnapshot(10_000, 10_000);

    expect(result.kind).toBe("snapshot");
    if (result.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    expect(result.snapshot.speed).toBe(36);
  });

  it("includes the second battery in state of charge when it arrives later", () => {
    const carState = createCarState();

    applyLocationSpeed(carState, 1_000);
    carState.applyMessage("car/1/battery/0/soc", 80, 1_000);
    carState.applyMessage("car/1/battery/0/capacity", 20_000, 1_000);

    const first = carState.buildSnapshot(5_000, 5_000);
    expect(first.kind).toBe("snapshot");
    if (first.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    expect(first.snapshot.stateOfCharge).toBe(80);

    carState.applyMessage("car/1/battery/1/soc", 40, 6_000);
    carState.applyMessage("car/1/battery/1/capacity", 10_000, 6_000);

    const second = carState.buildSnapshot(10_000, 10_000);
    expect(second.kind).toBe("snapshot");
    if (second.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    expect(second.snapshot.stateOfCharge).toBe(67);
  });

  it("carries the last observed values into the next 5s bucket", () => {
    const carState = createCarState();

    applyCompleteState(carState, 1_000);
    carState.applyMessage("car/1/gear", "2", 1_000);

    const first = carState.buildSnapshot(5_000, 5_000);
    expect(first.kind).toBe("snapshot");
    if (first.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }

    const second = carState.buildSnapshot(10_000, 10_000);
    expect(second.kind).toBe("snapshot");
    if (second.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    expect(second.snapshot).toEqual({
      ...first.snapshot,
      time: "1970-01-01T00:00:10.000Z",
    });
  });

  it("computes weighted state of charge across both batteries", () => {
    const carState = createCarState();

    applyLocationSpeed(carState, 1_000);
    carState.applyMessage("car/1/battery/0/soc", 100, 1_000);
    carState.applyMessage("car/1/battery/0/capacity", 10_000, 1_000);
    carState.applyMessage("car/1/battery/1/soc", 0, 1_000);
    carState.applyMessage("car/1/battery/1/capacity", 5_000, 1_000);

    const result = carState.buildSnapshot(5_000, 5_000);
    expect(result.kind).toBe("snapshot");
    if (result.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    // (100 * 10_000 + 0 * 5_000) / 15_000 = 66.67 -> 67
    expect(result.snapshot.stateOfCharge).toBe(67);
  });

  it("averages only batteries that have both soc and capacity", () => {
    const carState = createCarState();

    applyLocationSpeed(carState, 1_000);
    carState.applyMessage("car/1/battery/0/soc", 80, 1_000);
    carState.applyMessage("car/1/battery/0/capacity", 20_000, 1_000);
    carState.applyMessage("car/1/battery/1/capacity", 10_000, 1_000);

    const result = carState.buildSnapshot(5_000, 5_000);
    expect(result.kind).toBe("snapshot");
    if (result.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    expect(result.snapshot.stateOfCharge).toBe(80);
  });

  it("normalizes numeric gears and invalid gears", () => {
    const carState = createCarState();

    applyCompleteState(carState, 1_000);
    carState.applyMessage("car/1/gear", "3", 1_000);
    const thirdGear = carState.buildSnapshot(5_000, 5_000);

    expect(thirdGear.kind).toBe("snapshot");
    if (thirdGear.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    expect(thirdGear.snapshot.gear).toBe(3);

    carState.applyMessage("car/1/gear", "park", 6_000);
    const invalidGear = carState.buildSnapshot(10_000, 10_000);

    expect(invalidGear.kind).toBe("snapshot");
    if (invalidGear.kind !== "snapshot") {
      throw new Error("expected snapshot");
    }
    expect(invalidGear.snapshot.gear).toBe(0);
  });
});
