export type TranscriptEvent = {
  is_final?: boolean
  speech_final?: boolean
  text?: string
  type: string
}

export type LiveSttSession = {
  finalize: () => void
  setSending: (enabled: boolean) => void
  stop: () => void
}

type LiveSttOptions = {
  sendingOnStart?: boolean
}

function sttSocketUrl(sourceLanguage: 'en' | 'th'): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.hostname}:8787/v1/stt?source=${sourceLanguage}`
}

export async function startLiveStt(
  stream: MediaStream,
  sourceLanguage: 'en' | 'th',
  onEvent: (event: TranscriptEvent) => void,
  options: LiveSttOptions = {},
): Promise<LiveSttSession> {
  const audioContext = new AudioContext()
  await audioContext.audioWorklet.addModule('/pcm-processor.js')
  const source = audioContext.createMediaStreamSource(stream)
  const processor = new AudioWorkletNode(audioContext, 'wa-ngai-pcm')
  const silentGain = audioContext.createGain()
  silentGain.gain.value = 0
  let sending = options.sendingOnStart ?? false
  const socket = new WebSocket(sttSocketUrl(sourceLanguage))
  socket.binaryType = 'arraybuffer'

  processor.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    if (sending && socket.readyState === WebSocket.OPEN) socket.send(event.data)
  }
  socket.onmessage = (event) => {
    if (typeof event.data !== 'string') return
    try { onEvent(JSON.parse(event.data) as TranscriptEvent) } catch { onEvent({ type: 'error' }) }
  }

  source.connect(processor)
  processor.connect(silentGain)
  silentGain.connect(audioContext.destination)

  return {
    finalize: () => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'Finalize' }))
    },
    setSending: (enabled) => { sending = enabled },
    stop: () => {
      sending = false
      processor.disconnect()
      source.disconnect()
      socket.close()
      void audioContext.close()
    },
  }
}
