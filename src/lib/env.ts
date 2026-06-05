import "dotenv/config";
import { z } from "zod/v4";

const envSchema = z.object({
  MQTT_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  DATABASE_URL: z.string().min(1),
});

const env = envSchema.safeParse(process.env);
if (!env.success) {
  const details = env.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
  console.error(`Invalid configuration (set these env vars, e.g. in .env):\n${details.join("\n")}`);
  process.exit(1);
}

export const { MQTT_URL, RABBITMQ_URL, DATABASE_URL } = env.data;
