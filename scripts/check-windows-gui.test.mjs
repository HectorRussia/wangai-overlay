import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertWindowsGuiImage } from './check-windows-gui.mjs';

function image(subsystem = 2, magic = 0x20b) {
  const bytes = Buffer.alloc(0x80 + 24 + 240);
  bytes.writeUInt16LE(0x5a4d, 0);
  bytes.writeUInt32LE(0x80, 0x3c);
  bytes.writeUInt32LE(0x4550, 0x80);
  bytes.writeUInt16LE(240, 0x80 + 20);
  bytes.writeUInt16LE(magic, 0x80 + 24);
  bytes.writeUInt16LE(subsystem, 0x80 + 24 + 68);
  return bytes;
}

test('accepts Windows GUI PE32 and PE32+ executables', () => {
  for (const magic of [0x10b, 0x20b]) assert.doesNotThrow(() => assertWindowsGuiImage(image(2, magic)));
});

test('rejects Console and other non-GUI subsystems', () => {
  for (const subsystem of [0, 1, 3, 9]) {
    assert.throws(() => assertWindowsGuiImage(image(subsystem)), /Expected Windows GUI subsystem/);
  }
});

test('rejects truncated files and invalid header offsets', () => {
  const valid = image();
  for (const length of [0, 2, 63, 64, 0x80 + 23, valid.length - 1]) {
    assert.throws(() => assertWindowsGuiImage(valid.subarray(0, length)), /Invalid or truncated/);
  }
  for (const offset of [0, 63, 0xffffffff]) {
    const bytes = image(); bytes.writeUInt32LE(offset, 0x3c);
    assert.throws(() => assertWindowsGuiImage(bytes), /Invalid or truncated/);
  }
});

test('rejects wrong signatures and malformed optional headers', () => {
  for (const [offset, value] of [[0, 0], [0x80, 0], [0x80 + 20, 69], [0x80 + 24, 0]]) {
    const bytes = image(); bytes.writeUInt16LE(value, offset);
    assert.throws(() => assertWindowsGuiImage(bytes), /Invalid or truncated/);
  }
});
