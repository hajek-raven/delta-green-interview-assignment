import { z } from "zod/v4";

import { CAR_ID } from "../lib/config";

export const snapshotSchema = z.object({
  carId: z.literal(CAR_ID),
  time: z.iso.datetime(),
  stateOfCharge: z.int().min(0).max(100),
  latitude: z.number(),
  longitude: z.number(),
  gear: z.int().min(0).max(6),
  speed: z.number().nonnegative(),
});

export type Snapshot = z.infer<typeof snapshotSchema>;

export const snapshotJsonCodec = z.codec(z.string(), snapshotSchema, {
  decode: (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  },
  encode: (value) => JSON.stringify(value),
});
