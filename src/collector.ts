import mqtt from "mqtt";

import { createRabbitSnapshotPublisher } from "./adapters/rabbit-queue-publisher";
import { createCarState } from "./car/state";
import { CAR_ID, QUEUE, SAMPLE_MS } from "./lib/config";
import { MQTT_URL, RABBITMQ_URL } from "./lib/env";
import { onShutdown } from "./lib/shutdown";
import { createCollector } from "./services/collector";

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
  const collector = createCollector({
    mqttClient,
    publisher,
    carState: createCarState(),
    carId: CAR_ID,
    sampleMs: SAMPLE_MS,
  });

  onShutdown(() => collector.stop());

  await collector.run();
}
