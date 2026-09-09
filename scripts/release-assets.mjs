import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { assertWindowsGuiExecutable } from './check-windows-gui.mjs';
assertWindowsGuiExecutable('src-tauri/target/release/gamelingo.exe');
const version = JSON.parse(fs.readFileSync('package.json')).version;
const tag = `v${version}`;
if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== tag) throw Error('Tag mismatch');
const directory = 'src-tauri/target/release/bundle/nsis';
const files = fs.readdirSync(directory).filter(f => f.endsWith('-setup.exe'));
if (files.length !== 1) throw Error('Expected exactly one release installer in clean build');
const installer = files[0];
const signature = fs.readFileSync(path.join(directory, `${installer}.sig`), 'utf8').trim();
if (!signature) throw Error('Missing updater signature');
const notes = fs.readFileSync(`docs/releases/${tag}.md`, 'utf8');
const manifest = { version, notes, pub_date: new Date().toISOString(), platforms: {
  'windows-x86_64': { signature, url: `https://github.com/HectorRussia/wangai-overlay/releases/download/${tag}/${encodeURIComponent(installer)}` },
} };
const output = 'output/release';
fs.mkdirSync(output, { recursive: true });
for (const file of [installer, `${installer}.sig`]) fs.copyFileSync(path.join(directory, file), path.join(output, file));
fs.writeFileSync(`${output}/latest.json`, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(`${output}/RELEASE-NOTES.md`, notes);
const checksums = [installer, `${installer}.sig`, 'latest.json', 'RELEASE-NOTES.md'].map(file =>
  `${crypto.createHash('sha256').update(fs.readFileSync(path.join(output, file))).digest('hex')}  ${file}`);
fs.writeFileSync(`${output}/SHA256SUMS.txt`, checksums.join('\n') + '\n');
console.log(`Prepared signed ${tag} assets (not published)`);
