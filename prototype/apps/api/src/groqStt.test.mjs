import assert from 'node:assert/strict'
import test from 'node:test'

import { transcribeWithGroq } from './groqStt.mjs'

test('sends a bounded WebM chunk to Groq Whisper Turbo with language and glossary context', async () => {
  const calls = []
  const result = await transcribeWithGroq(
    {
      apiKey: 'test-groq-key',
      fetchImpl: async (url, options) => {
        calls.push({ url, options })
        return new Response(JSON.stringify({ text: 'Meet at the north gate.' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    },
    {
      audio: Buffer.from([1, 2, 3]),
      contentType: 'audio/webm;codecs=opus',
      language: 'en',
      glossary: ['Apex', 'north gate'],
    },
  )

  assert.deepEqual(result, { text: 'Meet at the north gate.' })
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-groq-key')
  assert.equal(calls[0].options.body.get('model'), 'whisper-large-v3-turbo')
  assert.equal(calls[0].options.body.get('language'), 'en')
  assert.equal(calls[0].options.body.get('temperature'), '0')
  assert.match(calls[0].options.body.get('prompt'), /Apex, north gate/)
  assert.equal(calls[0].options.body.get('file').type, 'audio/webm')
})

test('rejects invalid audio input before it reaches Groq', async () => {
  await assert.rejects(
    () => transcribeWithGroq({ apiKey: 'test-groq-key' }, {
      audio: Buffer.alloc(0), contentType: 'audio/webm', language: 'en', glossary: [],
    }),
    /audio/i,
  )

  await assert.rejects(
    () => transcribeWithGroq({ apiKey: 'test-groq-key' }, {
      audio: Buffer.from([1]), contentType: 'text/plain', language: 'en', glossary: [],
    }),
    /content/i,
  )
})
