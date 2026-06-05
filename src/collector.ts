import mqtt from "mqtt";

import { createRabbitSnapshotPublisher } from "./adapters/rabbit-queue-publisher";
import { createCarState } from "./car/state";
import type { SnapshotPublisher } from "./contracts/queue";
import { CAR_ID, QUEUE, SAMPLE_MS } from "./lib/config";
import { MQTT_URL, RABBITMQ_URL } from "./lib/env";
import { onShutdown } from "./lib/shutdown";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const publisher = createRabbitSnapshotPublisher({
    url: RABBITMQ_URL,
    queue: QUEUE,
  });

  const mqttClient = mqtt.connect(MQTT_URL);
  mqttClient.on("connect", () => {
    mqttClient.subscribe(`car/${CAR_ID}/#`);
    console.log(`Subscribed to car/${CAR_ID}/#`);
  });
  mqttClient.on("reconnect", () => console.log("MQTT reconnecting..."));
  mqttClient.on("error", (error) => console.error("MQTT error", error));

  const carState = createCarState();
  mqttClient.on("message", (topic, payload) => {
    const value = readValue(payload);
    if (value === undefined) {
      return;
    }
    carState.applyMessage(topic, value, Date.now());
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let shuttingDown = false;

  function scheduleTick() {
    if (shuttingDown) {
      return;
    }
    const now = Date.now();
    const bucket = Math.ceil(now / SAMPLE_MS) * SAMPLE_MS;
    timer = setTimeout(() => {
      void tick(publisher, carState, bucket);
      scheduleTick();
    }, bucket - now);
  }

  scheduleTick();

  onShutdown(async () => {
    shuttingDown = true;
    if (timer) {
      clearTimeout(timer);
    }
    mqttClient.end();
    await publisher.close();
  });
}

// Align ticks to wall-clock 5s boundaries so emitted timestamps land exactly on the
// bucket and we never skip or double a bucket due to setInterval drift.
async function tick(
  publisher: SnapshotPublisher,
  carState: ReturnType<typeof createCarState>,
  bucket: number,
) {
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
      return;
    }
    await publisher.publish(result.snapshot);
  } catch (error) {
    console.error("Failed to publish snapshot", error);
  }
}

function readValue(payload: Buffer): number | string | undefined {
  try {
    const parsed = JSON.parse(payload.toString());
    const value = parsed?.value;
    return typeof value === "number" || typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}
