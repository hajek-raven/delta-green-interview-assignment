import { z } from "zod/v4";

import { snapshotJsonCodec, type Snapshot } from "./snapshot";

export type SnapshotDecodeError = { readonly kind: "unparseable" };

export type SnapshotDecodeResult =
  | { readonly ok: true; readonly value: Snapshot }
  | { readonly ok: false; readonly error: SnapshotDecodeError };

export function decodeSnapshot(body: Buffer): SnapshotDecodeResult {
  const result = snapshotJsonCodec.safeParse(body.toString());
  if (!result.success) {
    return { ok: false, error: { kind: "unparseable" } };
  }
  return { ok: true, value: result.data };
}

export function encodeSnapshot(snapshot: Snapshot): Buffer {
  return Buffer.from(z.encode(snapshotJsonCodec, snapshot));
}
