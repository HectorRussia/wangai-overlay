import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSttUrl } from './sttBridge.mjs'

test('builds an xAI-native PCM16 streaming URL for the requested language', () => {
  const url = new URL(buildSttUrl('th'))

  assert.equal(url.origin, 'wss://api.x.ai')
  assert.equal(url.pathname, '/v1/stt')
  assert.equal(url.searchParams.get('sample_rate'), '16000')
  assert.equal(url.searchParams.get('encoding'), 'pcm')
  assert.equal(url.searchParams.get('interim_results'), 'true')
  assert.equal(url.searchParams.get('language'), 'th')
})

test('falls back to English for an unsupported browser-provided source language', () => {
  assert.equal(new URL(buildSttUrl('unknown')).searchParams.get('language'), 'en')
})
