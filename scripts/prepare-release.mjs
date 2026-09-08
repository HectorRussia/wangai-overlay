import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const test = process.argv.includes('--test');
const version = JSON.parse(fs.readFileSync('package.json')).version;
for (const [name, actual] of [
  ['Tauri', JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json')).version],
  ['Rust', fs.readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version = "([^"]+)"/m)?.[1]],
  ['Cargo.lock', fs.readFileSync('src-tauri/Cargo.lock', 'utf8').match(/name = "gamelingo"\r?\nversion = "([^"]+)"/)?.[1]],
]) if (actual !== version) throw Error(`${name} version does not match package.json`);
if (process.env.GITHUB_REF_TYPE === 'tag' && (test || process.env.GITHUB_REF_NAME !== `v${version}`)) throw Error('Release tag/version mismatch or test build on release tag');
if (process.argv.includes('--check-version')) { console.log(`Versions agree: ${version}`); process.exit(0); }
const required = name => { const v = process.env[name]?.trim(); if (!v) throw Error(`Missing ${name}`); return v; };
const base = new URL(required('WANGAI_API_BASE_URL'));
if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || /example\.|replace-|\.invalid/.test(base.href)) throw Error('WANGAI_API_BASE_URL must be a real HTTPS gateway URL');
const pubkey = required('WANGAI_UPDATER_PUBLIC_KEY');
const publicText = Buffer.from(pubkey, 'base64').toString('utf8');
if (!publicText.startsWith('untrusted comment:') || Buffer.from(publicText.split(/\r?\n/)[1] ?? '', 'base64').length !== 42) throw Error('Invalid updater public key');
required('TAURI_SIGNING_PRIVATE_KEY');
const bundle = 'output/worker/wangai-worker';
for (const file of ['wangai-worker.exe', '_internal/python312.dll', '_internal/silero_vad/data/silero_vad.onnx', 'licenses/DEPENDENCIES.txt']) {
  if (!fs.existsSync(`${bundle}/${file}`)) throw Error(`Pack worker first: missing ${file}`);
}
const config = {
  bundle: {
    targets: ['nsis'], createUpdaterArtifacts: true,
    resources: { '../dist/': 'web/', '../output/worker/wangai-worker/': 'worker/', '../docs/THIRD-PARTY-NOTICES.md': 'THIRD-PARTY-NOTICES.md' },
    windows: { nsis: { installMode: 'currentUser', displayLanguageSelector: false, languages: ['English'] } },
  },
  plugins: { updater: { pubkey, windows: { installMode: 'passive' } } },
};
if (test) {
  config.identifier = 'dev.gamelingo.overlay.release-test';
  config.productName = 'WANGAI Release Test';
  const testVersion = process.env.WANGAI_TEST_VERSION;
  if (testVersion) { if (!/^0\.2\.[01]$/.test(testVersion)) throw Error('Test version must be 0.2.0 or 0.2.1'); config.version = testVersion; }
  const endpoint = new URL(required('WANGAI_TEST_UPDATE_ENDPOINT'));
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1') throw Error('Test updater must use explicit loopback endpoint');
  config.plugins.updater.dangerousInsecureTransportProtocol = true;
}
fs.writeFileSync('src-tauri/tauri.release.generated.json', JSON.stringify(config, null, 2) + '\n');
console.log(`${test ? 'ISOLATED TEST' : 'Production'} release config prepared; no private key written to config`);
