import { afterEach, describe, expect, it, vi } from "vitest";

import { onShutdown } from "../src/lib/shutdown";

describe("onShutdown", () => {
  const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as typeof process.exit);

  afterEach(() => {
    exit.mockClear();
  });

  it("runs the handler once on SIGTERM and exits 0", async () => {
    const handler = vi.fn(async () => {});
    const { uninstall } = onShutdown(handler);

    process.emit("SIGTERM");
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledWith(0);
    });

    uninstall();
  });

  it("runs the handler on manual close()", async () => {
    const handler = vi.fn(async () => {});
    const { close, uninstall } = onShutdown(handler);

    close();
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledWith(0);
    });

    uninstall();
  });

  it("exits 1 when the handler throws", async () => {
    const handler = vi.fn(async () => {
      throw new Error("cleanup failed");
    });
    const { close, uninstall } = onShutdown(handler);

    close();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

    uninstall();
  });

  it("does not run the handler twice on a second signal", async () => {
    const handler = vi.fn(async () => {});
    const { uninstall } = onShutdown(handler);

    process.emit("SIGTERM");
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());

    exit.mockClear();
    process.emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(handler).toHaveBeenCalledOnce();

    uninstall();
  });
});
