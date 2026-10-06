import assert from "node:assert/strict";

const base = process.env.DOWNLOAD_CHECK_URL || "http://127.0.0.1:3101";
const response = await fetch(new URL("/download/windows", base), { redirect: "manual" });
assert.equal(response.status, 302, "Download route must redirect directly to an executable");
assert.equal(response.headers.get("cache-control"), "no-store");
const target = response.headers.get("location");
assert.match(target, /^https:\/\/github\.com\/HectorRussia\/wangai-overlay\/releases\/download\/v?\d+\.\d+\.\d+\/WANGAI_\d+\.\d+\.\d+_x64-(portable|setup)\.exe$/);
// HEAD verifies availability and attachment headers without downloading the binary.
const file = await fetch(target, { method: "HEAD", signal: AbortSignal.timeout(30_000) });
assert.equal(file.status, 200, "Release executable is publicly available");
assert.match(file.headers.get("content-disposition") || "", /attachment.*\.exe/i);
console.log(`Direct download verified: ${target}\n${file.headers.get("content-disposition")}`);
