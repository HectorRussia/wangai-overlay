import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

describe("Web Companion single-source transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches grouped app discovery from the authenticated apps endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await api.listRunningApps()).toEqual([]);
    expect(fetch).toHaveBeenCalledWith("/api/v1/apps", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("sends the single listening source command", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ schemaVersion: 13 }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    await api.selectListeningSource({ pid: 1, name: "chrome.exe", displayName: "Google Chrome", executablePath: "C:\\chrome.exe", isMistfall: false });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ command: "select_listening_source" });
  });
});
