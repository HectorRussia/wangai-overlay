import assert from "node:assert/strict";

const base = process.env.SEO_CHECK_URL || "http://127.0.0.1:3101";
const origin = process.env.SITE_URL || "https://wangai.app";
const indexable = process.env.SITE_INDEXABLE !== "false";

async function read(path) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, `${path} HTTP status`);
  return response;
}

let home;
for (const path of ["/", "/privacy", "/terms"]) {
  const html = await (await read(path)).text();
  if (path === "/") home = html;
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  assert.equal(canonical?.replace(/\/$/, ""), new URL(path, origin).href.replace(/\/$/, ""));
  assert.ok(html.includes("summary_large_image"), `${path} social card`);
  assert.ok(html.includes(`${origin}/opengraph-image`), `${path} social image`);
  const robots = html.match(/<meta name="robots" content="([^"]+)"/)?.[1];
  assert.equal(robots, indexable ? "index, follow" : "noindex, nofollow");
  assert.ok(html.includes('rel="describedby"'), `${path} AI summary discovery`);
}

const schema = JSON.parse(home.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
assert.deepEqual(schema["@graph"].map((item) => item["@type"]), ["WebSite", "SoftwareApplication", "FAQPage"]);
const visibleHtml = home.replace(/<script\b[^>]*>.*?<\/script>/gs, "");
const questions = schema["@graph"].find((item) => item["@type"] === "FAQPage").mainEntity;
assert.equal(questions.length, 6);
for (const question of questions) {
  assert.ok(visibleHtml.includes(question.name));
  assert.ok(visibleHtml.includes(question.acceptedAnswer.text), "Schema FAQ must also be visible to visitors");
}
const software = schema["@graph"].find((item) => item["@type"] === "SoftwareApplication");
assert.equal(software.url, origin);
assert.ok(!software.offers && !software.aggregateRating, "Do not invent prices or ratings");

const sitemap = await (await read("/sitemap.xml")).text();
assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]), ["/", "/privacy", "/terms"].map((path) => new URL(path, origin).href));
const robots = await (await read("/robots.txt")).text();
assert.ok(robots.includes(indexable ? "Allow: /" : "Disallow: /"));
if (indexable) assert.ok(robots.includes("OAI-SearchBot"));
assert.ok(robots.includes(`${origin}/sitemap.xml`));
for (const path of ["/llms.txt", "/index.md"]) {
  const response = await read(path);
  assert.ok(response.headers.get("content-type").includes(path.endsWith(".md") ? "text/markdown" : "text/plain"));
  const text = await response.text();
  assert.ok(text.includes(origin));
  assert.ok(!text.includes("storyboard23.chatgpt.site") && !text.includes("127.0.0.1"));
  if (path.endsWith(".md")) for (const question of questions) assert.ok(text.includes(question.acceptedAnswer.text));
}
const png = Buffer.from(await (await read("/opengraph-image")).arrayBuffer());
assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
assert.equal(png.readUInt32BE(16), 1200);
assert.equal(png.readUInt32BE(20), 630);
console.log(`SEO checks passed: canonical and social metadata on 3 pages, JSON-LD/visible FAQ consistency, sitemap, ${indexable ? "public crawler access" : "preview noindex"}, AI-readable files, and 1200x630 share image.`);
