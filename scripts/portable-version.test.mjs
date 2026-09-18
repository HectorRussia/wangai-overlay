import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePortableVersion } from './portable-version.mjs';
test('portable versions are not limited to the original QA pair', () => {
  for (const version of ['0.3.0','0.3.1','0.4.0','0.4.1','1.0.0']) assert.equal(validatePortableVersion(version), version);
});
test('rejects ambiguous, legacy and unsafe path versions', () => {
  for (const version of ['0.2.2','01.4.0','0.04.0','v0.4.0','0.4.0-beta','../0.4.0','0.4','0.4.0/evil','0.4.9007199254740992']) assert.throws(() => validatePortableVersion(version));
});
