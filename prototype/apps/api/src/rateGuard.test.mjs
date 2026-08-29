import assert from 'node:assert/strict'
import test from 'node:test'

import { createRateGuard } from './rateGuard.mjs'

test('allows only the configured number of chunk requests inside one rolling minute', () => {
  let now = 0
  const guard = createRateGuard({ maxRequests: 2, now: () => now })

  assert.equal(guard.consume(), true)
  assert.equal(guard.consume(), true)
  assert.equal(guard.consume(), false)

  now = 60_001
  assert.equal(guard.consume(), true)
})
