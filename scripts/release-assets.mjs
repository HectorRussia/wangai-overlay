// Final read-only guard. Packaging/signing is centralized in package-portable.py.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const directory=process.argv[2] ?? 'output/portable-build/release';
const version=JSON.parse(fs.readFileSync('package.json')).version;
const portable=JSON.parse(fs.readFileSync(path.join(directory,'latest-portable.json')));
const legacy=JSON.parse(fs.readFileSync(path.join(directory,'latest.json')));
const frozen=JSON.parse(fs.readFileSync('portable/legacy-0.2.2.json'));
if (JSON.stringify(legacy)!==JSON.stringify(frozen)) throw Error('Legacy manifest must remain pinned to 0.2.2');
if (portable.version!==version || portable.platforms['windows-x86_64'].url!==`https://github.com/HectorRussia/wangai-overlay/releases/download/v${version}/WANGAI_${version}_x64-update.zip`) throw Error('Portable channel mismatch');
if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME!==`v${version}`) throw Error('Tag mismatch');
for (const required of [`WANGAI_${version}_x64-portable.exe`,`WANGAI_${version}_x64-update.zip`,`WANGAI_${version}_x64-update.zip.sig`,'package-manifest.json','package-manifest.json.sig','latest.json','latest-portable.json','windows-subsystems.json','webview2.lock.json']) if (!fs.existsSync(path.join(directory,required))) throw Error(`Missing ${required}`);
for (const line of fs.readFileSync(path.join(directory,'SHA256SUMS.txt'),'utf8').trim().split('\n')) {
  const [hash,name]=line.split('  ');
  if (!name || path.basename(name)!==name) throw Error('Invalid checksum filename');
  const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex');
  if (actual!==hash) throw Error(`Checksum mismatch: ${name}`);
}
console.log(`Validated ${version} Portable assets and frozen legacy channel; publication is a separate owner action.`);
