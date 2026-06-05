import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

import { DATABASE_URL } from "../lib/env";

export function createDb() {
  const client = new SQL(DATABASE_URL);
  const db = drizzle({ client });
  return { db, client };
}

export type Db = ReturnType<typeof createDb>["db"];
