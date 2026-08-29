import type { LiveSttSession, TranscriptEvent } from './liveStt'
import { startSileroVad, type SpeechDetector, type VadProfile } from './sileroVad'

type ChunkedSttOptions = {
  glossary?: string[]
  sendingOnStart?: boolean
  vadProfile?: VadProfile
  startDetector?: (stream: MediaStream, onSegment: (segment: Blob) => void, profile?: VadProfile, onSpeechStart?: () => void) => Promise<SpeechDetector>
}

const MIN_REQUEST_INTERVAL_MS = 6_000
const MAX_CONTINUOUS_SPEECH_MS = 8_000
const MAX_PENDING_SEGMENTS = 2

const startDefaultDetector = (stream: MediaStream, onSegment: (segment: Blob) => void, profile?: VadProfile, onSpeechStart?: () => void) =>
  startSileroVad(stream, onSegment, undefined, profile, onSpeechStart)

function recorderMimeType() {
  return MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined
}

function safeGlossary(glossary: string[]) {
  return glossary.slice(0, 20).map((term) => term.trim()).filter((term) => term.length > 0 && term.length <= 50)
}

async function transcribeChunk(blob: Blob, language: 'en' | 'th', glossary: string[]) {
  const response = await fetch('/v1/stt/chunk', {
    method: 'POST',
    headers: {
      'content-type': blob.type || 'audio/webm',
      'x-wa-ngai-language': language,
      'x-wa-ngai-glossary': encodeURIComponent(JSON.stringify(glossary)),
    },
    body: blob,
  })
  if (!response.ok) throw new Error('Transcription unavailable')
  const result = await response.json() as { text?: string }
  if (!result.text) throw new Error('Transcription unavailable')
  return result.text
}

export async function startChunkedStt(
  stream: MediaStream,
  sourceLanguage: 'en' | 'th',
  onEvent: (event: TranscriptEvent) => void,
  { glossary = [], sendingOnStart = false, vadProfile = 'game', startDetector = startDefaultDetector }: ChunkedSttOptions = {},
): Promise<LiveSttSession> {
  const audioStream = new MediaStream(stream.getAudioTracks())
  const options = recorderMimeType() ? { mimeType: recorderMimeType() } : undefined
  const recorder = new MediaRecorder(audioStream, options)
  const cleanGlossary = safeGlossary(glossary)
  let sending = sendingOnStart
  let stopped = false
  let lastRequestAt = Number.NEGATIVE_INFINITY
  const queuedBlobs: Blob[] = []
  let queuedUploadTimer: ReturnType<typeof setTimeout> | undefined
  let uploading = false
  let detector: SpeechDetector | undefined
  let continuousSpeechTimer: ReturnType<typeof setTimeout> | undefined

  const clearContinuousSpeechTimer = () => {
    if (continuousSpeechTimer) clearTimeout(continuousSpeechTimer)
    continuousSpeechTimer = undefined
  }

  const beginContinuousSpeechTimer = () => {
    clearContinuousSpeechTimer()
    continuousSpeechTimer = setTimeout(() => {
      void detector?.flush?.()
    }, MAX_CONTINUOUS_SPEECH_MS)
  }

  const uploadNext = async () => {
    if (uploading || queuedBlobs.length === 0 || stopped) return
    const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt))
    if (waitMs > 0) {
      if (!queuedUploadTimer) {
        queuedUploadTimer = setTimeout(() => {
          queuedUploadTimer = undefined
          void uploadNext()
        }, waitMs)
      }
      return
    }

    const blob = queuedBlobs.shift()!
    uploading = true
    lastRequestAt = Date.now()
    onEvent({ type: 'transcript.processing' })
    try {
      const text = await transcribeChunk(blob, sourceLanguage, cleanGlossary)
      if (text) onEvent({ type: 'transcript.final', text, is_final: true, speech_final: true })
    } catch {
      onEvent({ type: 'error' })
    } finally {
      uploading = false
      if (queuedBlobs.length > 0) void uploadNext()
    }
  }

  const enqueue = (blob: Blob) => {
    if (stopped || blob.size === 0) return
    queuedBlobs.push(blob)
    if (queuedBlobs.length > MAX_PENDING_SEGMENTS) queuedBlobs.shift()
    void uploadNext()
  }

  recorder.ondataavailable = (event) => {
    const isFinalPushToTalkChunk = !sendingOnStart && recorder.state === 'inactive'
    if ((!sending && !isFinalPushToTalkChunk) || event.data.size === 0) return
    enqueue(event.data)
  }

  const startRecording = () => {
    if (recorder.state === 'inactive' && !stopped) recorder.start()
  }

  if (sendingOnStart) {
    detector = await startDetector(audioStream, (segment) => {
      clearContinuousSpeechTimer()
      if (sending) enqueue(segment)
    }, vadProfile, beginContinuousSpeechTimer)
  }

  return {
    finalize: () => {
      if (!sendingOnStart && recorder.state === 'recording') recorder.stop()
    },
    setSending: (enabled) => {
      sending = enabled
      if (enabled) startRecording()
      if (!enabled && !sendingOnStart && recorder.state === 'recording') recorder.stop()
    },
    stop: () => {
      stopped = true
      sending = false
      clearContinuousSpeechTimer()
      if (queuedUploadTimer) clearTimeout(queuedUploadTimer)
      queuedUploadTimer = undefined
      queuedBlobs.length = 0
      if (recorder.state !== 'inactive') recorder.stop()
      void detector?.stop()
    },
  }
}
