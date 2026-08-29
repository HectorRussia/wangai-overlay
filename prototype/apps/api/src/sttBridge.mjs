import { WebSocket, WebSocketServer } from 'ws'

const SUPPORTED_LANGUAGES = new Set(['en', 'th'])
const MAX_BUFFERED_BYTES = 64 * 1024

export function buildSttUrl(sourceLanguage) {
  const language = SUPPORTED_LANGUAGES.has(sourceLanguage) ? sourceLanguage : 'en'
  const url = new URL('wss://api.x.ai/v1/stt')
  url.searchParams.set('sample_rate', '16000')
  url.searchParams.set('encoding', 'pcm')
  url.searchParams.set('interim_results', 'true')
  url.searchParams.set('endpointing', '400')
  url.searchParams.set('language', language)
  return url.toString()
}

function sendJson(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

export function attachSttBridge(server, { apiKey, isAllowedOrigin, WebSocketImpl = WebSocket } = {}) {
  const clientServer = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.pathname !== '/v1/stt') {
      socket.destroy()
      return
    }
    if (!apiKey || !isAllowedOrigin(request.headers.origin)) {
      socket.destroy()
      return
    }

    clientServer.handleUpgrade(request, socket, head, (clientSocket) => {
      clientServer.emit('connection', clientSocket, request, url.searchParams.get('source'))
    })
  })

  clientServer.on('connection', (clientSocket, _request, sourceLanguage) => {
    const upstream = new WebSocketImpl(buildSttUrl(sourceLanguage), {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    let upstreamReady = false
    let bufferedFrames = []
    let bufferedBytes = 0

    const flushFrames = () => {
      for (const { data, isBinary } of bufferedFrames) {
        upstream.send(data, { binary: isBinary })
      }
      bufferedFrames = []
      bufferedBytes = 0
    }

    upstream.on('message', (data, isBinary) => {
      if (!isBinary) {
        const rawMessage = data.toString()
        try {
          const event = JSON.parse(rawMessage)
          if (event.type === 'transcript.created') {
            upstreamReady = true
            flushFrames()
          }
        } catch {
          // Forward provider text unchanged; the browser will surface its error state.
        }
        if (clientSocket.readyState === clientSocket.OPEN) {
          clientSocket.send(rawMessage)
        }
        return
      }
      if (clientSocket.readyState === clientSocket.OPEN) {
        clientSocket.send(data, { binary: true })
      }
    })

    upstream.on('error', () => {
      sendJson(clientSocket, { type: 'error', code: 'STT_UNAVAILABLE', message: 'Speech recognition is temporarily unavailable.' })
    })
    upstream.on('close', () => clientSocket.close())

    clientSocket.on('message', (data, isBinary) => {
      if (upstream.readyState === upstream.CLOSING || upstream.readyState === upstream.CLOSED) {
        return
      }
      if (upstreamReady) {
        upstream.send(data, { binary: isBinary })
        return
      }
      const size = data.length ?? data.byteLength ?? 0
      if (bufferedBytes + size > MAX_BUFFERED_BYTES) {
        sendJson(clientSocket, { type: 'error', code: 'STT_NOT_READY', message: 'Speech recognition is still starting.' })
        return
      }
      bufferedBytes += size
      bufferedFrames.push({ data, isBinary })
    })

    clientSocket.on('close', () => upstream.close())
  })

  return clientServer
}
