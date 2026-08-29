import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

import { attachSttBridge } from './sttBridge.mjs'
import { transcribeWithGroq } from './groqStt.mjs'
import { createRateGuard } from './rateGuard.mjs'
import { translateWithXai } from './translation.mjs'

const MAX_BODY_BYTES = 4 * 1024
const MAX_AUDIO_BYTES = 3 * 1024 * 1024
const LOCAL_ORIGINS = new Set(['http://127.0.0.1:5173', 'http://localhost:5173'])

function sendJson(response, status, payload, origin) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'content-security-policy': "default-src 'none'",
    'cross-origin-resource-policy': 'same-site',
    'x-content-type-options': 'nosniff',
  }

  if (origin) {
    headers['access-control-allow-origin'] = origin
    headers.vary = 'Origin'
  }

  response.writeHead(status, headers)
  response.end(JSON.stringify(payload))
}

async function readBody(request, maxBytes) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) {
      throw new Error('REQUEST_TOO_LARGE')
    }
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

async function readJsonBody(request) {
  try {
    return JSON.parse((await readBody(request, MAX_BODY_BYTES)).toString('utf8'))
  } catch (error) {
    if (error?.message === 'REQUEST_TOO_LARGE') throw error
    throw new Error('INVALID_JSON')
  }
}

function isAllowedOrigin(origin) {
  return typeof origin === 'string' && LOCAL_ORIGINS.has(origin)
}

function parseGlossary(value) {
  if (typeof value !== 'string' || value.length > 1000) throw new TypeError('Glossary is invalid.')
  try {
    const terms = JSON.parse(decodeURIComponent(value))
    if (!Array.isArray(terms) || terms.length > 20 || terms.some((term) => typeof term !== 'string' || term.trim().length === 0 || term.length > 50)) {
      throw new TypeError('Glossary is invalid.')
    }
    return terms.map((term) => term.trim())
  } catch (error) {
    if (error instanceof TypeError) throw error
    throw new TypeError('Glossary is invalid.')
  }
}

export function createApiServer({ apiKey, groqApiKey, model = 'grok-4.3', translate = translateWithXai, groqTranscribe = transcribeWithGroq, rateGuard = createRateGuard() } = {}) {
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin

    if (!isAllowedOrigin(origin)) {
      sendJson(response, 403, {
        error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Request origin is not allowed.' },
      })
      return
    }

    if (request.method === 'OPTIONS' && (request.url === '/v1/translate' || request.url === '/v1/stt/chunk')) {
      response.writeHead(204, {
        'access-control-allow-headers': 'content-type, x-wa-ngai-language, x-wa-ngai-glossary',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-origin': origin,
        vary: 'Origin',
      })
      response.end()
      return
    }

    if (request.method === 'POST' && request.url === '/v1/stt/chunk') {
      if (!groqApiKey) {
        sendJson(response, 503, { error: { code: 'SERVICE_NOT_CONFIGURED', message: 'Speech service is not configured.' } }, origin)
        return
      }
      if (!rateGuard.consume()) {
        sendJson(response, 429, {
          error: { code: 'RATE_LIMITED', message: 'Speech is busy. Try again in a moment.' },
        }, origin)
        return
      }
      try {
        const language = request.headers['x-wa-ngai-language']
        const contentType = request.headers['content-type']
        if ((language !== 'en' && language !== 'th') || typeof contentType !== 'string') throw new TypeError('Audio request is invalid.')
        const glossary = parseGlossary(request.headers['x-wa-ngai-glossary'] ?? '[]')
        const audio = await readBody(request, MAX_AUDIO_BYTES)
        const result = await groqTranscribe({ apiKey: groqApiKey }, { audio, contentType, language, glossary })
        sendJson(response, 200, result, origin)
      } catch (error) {
        const isClientError = error instanceof TypeError || error?.message === 'REQUEST_TOO_LARGE'
        sendJson(response, isClientError ? 422 : 502, {
          error: {
            code: error?.message === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : isClientError ? 'INVALID_REQUEST' : 'TRANSCRIPTION_UNAVAILABLE',
            message: isClientError ? 'Audio request is invalid.' : 'Speech transcription is temporarily unavailable.',
          },
        }, origin)
      }
      return
    }

    if (request.method !== 'POST' || request.url !== '/v1/translate') {
      sendJson(response, 404, {
        error: { code: 'NOT_FOUND', message: 'Route not found.' },
      }, origin)
      return
    }

    if (!apiKey) {
      sendJson(response, 503, {
        error: { code: 'SERVICE_NOT_CONFIGURED', message: 'Translation service is not configured.' },
      }, origin)
      return
    }

    try {
      const input = await readJsonBody(request)
      const result = await translate({ apiKey, model }, input)
      sendJson(response, 200, result, origin)
    } catch (error) {
      const isClientError = error instanceof TypeError || error?.message === 'INVALID_JSON' || error?.message === 'REQUEST_TOO_LARGE'
      const status = isClientError ? 422 : 502
      const code = error?.message === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : isClientError ? 'INVALID_REQUEST' : 'TRANSLATION_UNAVAILABLE'
      const message = error?.message === 'REQUEST_TOO_LARGE'
        ? 'Translation request is too large.'
        : isClientError
          ? 'Translation request is invalid.'
          : 'Translation is temporarily unavailable.'

      sendJson(response, status, { error: { code, message } }, origin)
    }
  })
  attachSttBridge(server, { apiKey, isAllowedOrigin })
  return server
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  const port = Number(process.env.PORT ?? 8787)
  const server = createApiServer({
    apiKey: process.env.XAI_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    model: process.env.XAI_TRANSLATION_MODEL ?? 'grok-4.3',
  })
  server.listen(port, '127.0.0.1', () => {
    console.log(`WA-NGAI local API listening on http://127.0.0.1:${port}`)
  })
}
