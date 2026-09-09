import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Check the linked application, not the NSIS installer or the console worker.
export function assertWindowsGuiImage(bytes) {
  const invalid = () => { throw Error('Invalid or truncated Windows PE executable'); };
  if (bytes.length < 64 || bytes.readUInt16LE(0) !== 0x5a4d) invalid();
  const pe = bytes.readUInt32LE(0x3c);
  if (pe < 64 || pe + 24 > bytes.length || bytes.readUInt32LE(pe) !== 0x4550) invalid();
  const optionalSize = bytes.readUInt16LE(pe + 20);
  const optional = pe + 24;
  if (optionalSize < 70 || optional + optionalSize > bytes.length) invalid();
  const magic = bytes.readUInt16LE(optional);
  if (magic !== 0x10b && magic !== 0x20b) invalid();
  const subsystem = bytes.readUInt16LE(optional + 68);
  if (subsystem !== 2) {
    throw Error(`Expected Windows GUI subsystem (2), got ${subsystem}; the release must not open a Console window`);
  }
}

export function assertWindowsGuiExecutable(file) {
  assertWindowsGuiImage(fs.readFileSync(file));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw Error('Usage: node scripts/check-windows-gui.mjs <application.exe>');
    assertWindowsGuiExecutable(process.argv[2]);
    console.log('Windows GUI subsystem verified (no automatic Console window)');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
