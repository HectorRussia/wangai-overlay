import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../src/app/download/windows/route.ts";

function release(version = "0.5.0", kind = "portable") {
  const name = `WANGAI_${version}_x64-${kind}.exe`;
  return {
    tag_name: `v${version}`, draft: false, prerelease: false,
    assets: [{ name, browser_download_url: `https://github.com/HectorRussia/wangai-overlay/releases/download/v${version}/${name}` }],
  };
}

async function request(t, body, status = 200) {
  t.mock.method(globalThis, "fetch", async () => Response.json(body, { status }));
  return GET();
}

test("downloads the current and next stable release without changing the button URL", async (t) => {
  for (const version of ["0.5.0", "0.6.0"]) {
    const response = await request(t, release(version));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), release(version).assets[0].browser_download_url);
    assert.equal(response.headers.get("cache-control"), "no-store");
    t.mock.restoreAll();
  }
});

test("supports setup releases and ignores updater ZIPs and signatures", async (t) => {
  const body = release("0.2.2", "setup");
  body.assets.unshift({ name: "WANGAI_0.2.2_x64-update.zip", browser_download_url: "https://example.com/update.zip" });
  const response = await request(t, body);
  assert.equal(response.headers.get("location"), body.assets[1].browser_download_url);
});

test("rejects draft, beta, missing files and unexpected download destinations", async (t) => {
  const unsafe = release();
  unsafe.assets[0].browser_download_url = "https://example.com/installer.exe";
  for (const body of [
    { ...release(), draft: true }, { ...release(), prerelease: true },
    { ...release(), assets: [] }, unsafe, null,
  ]) {
    const response = await request(t, body);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    t.mock.restoreAll();
  }
});

test("provides a retryable response when GitHub fails or the request times out", async (t) => {
  let response = await request(t, { message: "rate limited" }, 403);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "60");
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => { throw new Error("timeout"); });
  response = await GET();
  assert.equal(response.status, 503);
  assert.match(await response.text(), /ลองใหม่/);
});
