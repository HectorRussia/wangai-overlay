import assert from 'node:assert/strict'
import test from 'node:test'

import { createApiServer } from './server.mjs'

async function withServer(handler, run) {
  const server = createApiServer({
    apiKey: 'server-only-key',
    translate: handler,
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  try {
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

async function withGroqServer(handler, run, rateGuard) {
  const server = createApiServer({
    apiKey: 'server-only-xai-key',
    groqApiKey: 'server-only-groq-key',
    groqTranscribe: handler,
    rateGuard,
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  try {
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('accepts a bounded same-origin translation request and returns only the translation', async () => {
  await withServer(async () => ({ text: 'กำลังไป' }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/translate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5173',
      },
      body: JSON.stringify({ sourceLanguage: 'th', targetLanguage: 'en', text: 'กำลังไป' }),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { text: 'กำลังไป' })
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173')
  })
})

test('rejects a cross-origin request before it calls the provider', async () => {
  let providerCalled = false
  await withServer(async () => {
    providerCalled = true
    return { text: 'should not happen' }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/translate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://untrusted.example',
      },
      body: JSON.stringify({ sourceLanguage: 'en', targetLanguage: 'th', text: 'Hello' }),
    })

    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), {
      error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Request origin is not allowed.' },
    })
    assert.equal(providerCalled, false)
  })
})

test('accepts a local bounded audio chunk and returns only Groq transcript text', async () => {
  await withGroqServer(async (config, input) => {
    assert.equal(config.apiKey, 'server-only-groq-key')
    assert.equal(input.language, 'th')
    assert.deepEqual(input.glossary, ['Apex', 'ลาดชัน'])
    return { text: 'ไปทางเหนือ' }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/stt/chunk`, {
      method: 'POST',
      headers: {
        'content-type': 'audio/webm;codecs=opus',
        origin: 'http://127.0.0.1:5173',
        'x-wa-ngai-language': 'th',
        'x-wa-ngai-glossary': encodeURIComponent(JSON.stringify(['Apex', 'ลาดชัน'])),
      },
      body: Buffer.from([1, 2, 3]),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { text: 'ไปทางเหนือ' })
  })
})

test('returns a clear rate-limit response without calling Groq', async () => {
  let providerCalled = false
  await withGroqServer(async () => {
    providerCalled = true
    return { text: 'should not happen' }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/stt/chunk`, {
      method: 'POST',
      headers: {
        'content-type': 'audio/webm',
        origin: 'http://127.0.0.1:5173',
        'x-wa-ngai-language': 'en',
      },
      body: Buffer.from([1]),
    })

    assert.equal(response.status, 429)
    assert.deepEqual(await response.json(), {
      error: { code: 'RATE_LIMITED', message: 'Speech is busy. Try again in a moment.' },
    })
    assert.equal(providerCalled, false)
  }, { consume: () => false })
})
