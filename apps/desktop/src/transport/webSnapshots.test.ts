import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { snapshotFixture } from "../test/fixtures";
import { connectWebSnapshot } from "./webSnapshots";

class Socket {
  static instances: Socket[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  close = vi.fn(() => this.onclose?.());
  constructor(public url: string) {
    Socket.instances.push(this);
  }
}

describe("Web Companion reconnect lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Socket.instances = [];
    vi.stubGlobal("WebSocket", Socket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(snapshotFixture()))),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls during disconnection, stops polling on reconnect and cancels all timers on cleanup", async () => {
    const received = vi.fn();
    const disconnected = vi.fn();
    const stop = await connectWebSnapshot(received, disconnected);
    const first = Socket.instances[0];
    first.onopen?.();
    first.onmessage?.({ data: "invalid JSON" });
    expect(received).not.toHaveBeenCalled();
    first.onclose?.();
    expect(disconnected).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(received).toHaveBeenCalledOnce();
    expect(Socket.instances).toHaveLength(2);
    const second = Socket.instances[1];
    second.onopen?.();
    second.onmessage?.({ data: JSON.stringify(snapshotFixture()) });
    expect(received).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(received).toHaveBeenCalledTimes(2);
    stop();
    expect(second.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
