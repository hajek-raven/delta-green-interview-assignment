import type { MqttClient } from "mqtt";

import type { createCarState } from "../car/state";
import type { SnapshotPublisher } from "../contracts/queue";
import { logSnapshot } from "../lib/log";

type CollectorDeps = {
  readonly mqttClient: MqttClient;
  readonly publisher: SnapshotPublisher;
  readonly carState: ReturnType<typeof createCarState>;
  readonly carId: number;
  readonly sampleMs: number;
};

export function createCollector({
  mqttClient,
  publisher,
  carState,
  carId,
  sampleMs,
}: CollectorDeps) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let shuttingDown = false;
  let stopResolve: (() => void) | undefined;

  function scheduleTick() {
    if (shuttingDown) {
      return;
    }

    const now = Date.now();
    const bucket = Math.ceil(now / sampleMs) * sampleMs;
    timer = setTimeout(() => {
      void publishSnapshotForBucket(bucket);
      scheduleTick();
    }, bucket - now);
  }

  async function publishSnapshotForBucket(bucket: number) {
    try {
      const result = carState.buildSnapshot(bucket, Date.now());
      if (result.kind === "stale") {
        if (result.changed) {
          console.log("Source went stale, pausing snapshots");
        }
        return;
      }

      if (result.recovered) {
        console.log("Source recovered");
      }

      if (result.kind === "incomplete") {
        if (result.recovered) {
          console.log("Waiting for complete car state before publishing");
        }
        return;
      }

      await publisher.publish(result.snapshot);
      logSnapshot("Published snapshot", result.snapshot);
    } catch (error) {
      console.error("Failed to publish snapshot", error);
    }
  }

  return {
    async run() {
      const stopped = new Promise<void>((resolve) => {
        stopResolve = resolve;
      });

      mqttClient.on("connect", () => {
        mqttClient.subscribe(`car/${carId}/#`);
        console.log(`Subscribed to car/${carId}/#`);
      });
      mqttClient.on("reconnect", () => console.log("MQTT reconnecting..."));
      mqttClient.on("error", (error) => console.error("MQTT error", error));
      mqttClient.on("message", (topic, payload) => {
        const value = readValue(payload);
        if (value === undefined) {
          return;
        }
        carState.applyMessage(topic, value, Date.now());
      });

      scheduleTick();
      await stopped;
    },

    async stop() {
      shuttingDown = true;
      if (timer) {
        clearTimeout(timer);
      }
      mqttClient.end();
      await publisher.close();
      stopResolve?.();
    },
  };
}

function readValue(payload: Buffer): number | string | undefined {
  try {
    const parsed = JSON.parse(payload.toString());
    const value = parsed?.value;
    return typeof value === "number" || typeof value === "string"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
