import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const dest = 'output/worker/wangai-worker/licenses/desktop';
fs.mkdirSync(dest, { recursive: true });
const inventory = [];
function copyNotices(dir, name, version, license, licenseFile) {
  const target = path.join(dest, `${name.replaceAll('/', '_')}-${version}`);
  fs.mkdirSync(target, { recursive: true });
  inventory.push({ name, version, license });
  const candidates = fs.readdirSync(dir).filter(f => /^(license|licence|copying|notice|copyright)/i.test(f));
  if (licenseFile) candidates.push(licenseFile);
  for (const file of new Set(candidates)) {
    const source = path.resolve(dir, file);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(target, path.basename(file)), { recursive: true });
  }
}
for (const manifest of ['src-tauri/Cargo.toml','portable/Cargo.toml']) {
  const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc', '--manifest-path', manifest], { maxBuffer: 32 * 1024 * 1024 }));
  for (const p of metadata.packages) if (p.source) copyNotices(path.dirname(p.manifest_path), p.name, p.version, p.license, p.license_file);
}
const seen = new Set();
function npmPackage(name, from) {
  const req = createRequire(path.resolve(from, 'package.json'));
  let dir = path.dirname(req.resolve(name));
  while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
  if (seen.has(`${p.name}@${p.version}`)) return;
  seen.add(`${p.name}@${p.version}`);
  copyNotices(dir, p.name, p.version, p.license);
  for (const dependency of Object.keys(p.dependencies ?? {})) npmPackage(dependency, dir);
}
for (const name of Object.keys(JSON.parse(fs.readFileSync('package.json')).dependencies)) npmPackage(name, '.');
fs.writeFileSync(path.join(dest, 'DEPENDENCIES.json'), JSON.stringify(inventory, null, 2));
console.log(`Collected notices for ${inventory.length} desktop dependencies`);
