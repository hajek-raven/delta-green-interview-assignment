import { createDb } from "./db";

export async function ensureDbSetup() {
  const { client } = createDb();
  try {
    await client`
      CREATE UNIQUE INDEX IF NOT EXISTS "car_state_car_id_time_idx"
      ON "car_state" ("car_id", "time")
    `;
  } finally {
    await client.close({ timeout: 5 });
  }
}
