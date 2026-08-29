import { afterEach, describe, expect, it, vi } from 'vitest'

import { startChunkedStt } from './chunkedStt'

class FakeRecorder {
  static latest: FakeRecorder | undefined
  static isTypeSupported = vi.fn(() => true)
  ondataavailable: ((event: BlobEvent) => void) | null = null
  state: RecordingState = 'inactive'
  start = vi.fn(() => { this.state = 'recording' })
  stop = vi.fn(() => { this.state = 'inactive' })
  requestData = vi.fn()

  constructor() { FakeRecorder.latest = this }
}

describe('startChunkedStt', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps the microphone private until push-to-talk then sends one WebM chunk', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'กำลังไป' }), { status: 200 }))
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('MediaStream', class { constructor() {} })

    const onEvent = vi.fn()
    const session = await startChunkedStt({ getAudioTracks: () => [{}] } as unknown as MediaStream, 'th', onEvent)
    expect(FakeRecorder.latest?.start).not.toHaveBeenCalled()

    session.setSending(true)
    expect(FakeRecorder.latest?.start).toHaveBeenCalledOnce()
    session.setSending(false)
    FakeRecorder.latest?.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) } as BlobEvent)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

    expect(onEvent).toHaveBeenCalledWith({ type: 'transcript.processing' })
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ text: 'กำลังไป', is_final: true, speech_final: true })))
  })

  it('sends only the completed local VAD segment for shared game audio', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'Meet at the gate.' }), { status: 200 }))
    const stopDetector = vi.fn().mockResolvedValue(undefined)
    const startDetector = vi.fn(async (_stream, onSegment) => {
      onSegment(new Blob(['speech'], { type: 'audio/wav' }))
      return { stop: stopDetector }
    })
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('MediaStream', class { constructor() {} })

    const session = await startChunkedStt(
      { getAudioTracks: () => [{}] } as unknown as MediaStream,
      'en',
      vi.fn(),
      { sendingOnStart: true, startDetector },
    )

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(FakeRecorder.latest?.start).not.toHaveBeenCalled()
    session.stop()
    expect(stopDetector).toHaveBeenCalledOnce()
  })

  it('flushes a continuous speaking turn into a new chunk instead of waiting for a long silence', async () => {
    vi.useFakeTimers()
    const flush = vi.fn().mockResolvedValue(undefined)
    let onSpeechStart: (() => void) | undefined
    const startDetector = vi.fn(async (_stream, _onSegment, _profile, notifySpeechStart) => {
      onSpeechStart = notifySpeechStart
      return { flush, stop: vi.fn().mockResolvedValue(undefined) }
    })
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    vi.stubGlobal('MediaStream', class { constructor() {} })

    await startChunkedStt(
      { getAudioTracks: () => [{}] } as unknown as MediaStream,
      'en',
      vi.fn(),
      { sendingOnStart: true, startDetector },
    )

    onSpeechStart?.()
    await vi.advanceTimersByTimeAsync(7_999)
    expect(flush).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(flush).toHaveBeenCalledOnce()
  })

  it('queues the next speech segment until the cost guard interval has passed instead of dropping it', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'North gate.' }), { status: 200 }))
    let onSegment: ((segment: Blob) => void) | undefined
    const startDetector = vi.fn(async (_stream, emitSegment) => {
      onSegment = emitSegment
      return { stop: vi.fn().mockResolvedValue(undefined) }
    })
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    vi.stubGlobal('MediaStream', class { constructor() {} })
    vi.stubGlobal('fetch', fetchMock)

    await startChunkedStt(
      { getAudioTracks: () => [{}] } as unknown as MediaStream,
      'en',
      vi.fn(),
      { sendingOnStart: true, startDetector },
    )

    onSegment?.(new Blob(['first'], { type: 'audio/wav' }))
    await vi.advanceTimersByTimeAsync(0)
    onSegment?.(new Blob(['second'], { type: 'audio/wav' }))
    await vi.advanceTimersByTimeAsync(6_000)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps only the two newest pending segments when transcription falls behind', async () => {
    vi.useFakeTimers()
    let resolveFirstUpload: ((response: Response) => void) | undefined
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirstUpload = resolve }))
      .mockResolvedValue(new Response(JSON.stringify({ text: 'North gate.' }), { status: 200 }))
    let onSegment: ((segment: Blob) => void) | undefined
    const startDetector = vi.fn(async (_stream, emitSegment) => {
      onSegment = emitSegment
      return { stop: vi.fn().mockResolvedValue(undefined) }
    })
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    vi.stubGlobal('MediaStream', class { constructor() {} })
    vi.stubGlobal('fetch', fetchMock)

    await startChunkedStt(
      { getAudioTracks: () => [{}] } as unknown as MediaStream,
      'en',
      vi.fn(),
      { sendingOnStart: true, startDetector },
    )

    onSegment?.(new Blob(['first'], { type: 'audio/wav' }))
    await vi.advanceTimersByTimeAsync(0)
    onSegment?.(new Blob(['stale'], { type: 'audio/wav' }))
    onSegment?.(new Blob(['current'], { type: 'audio/wav' }))
    onSegment?.(new Blob(['newest'], { type: 'audio/wav' }))

    resolveFirstUpload?.(new Response(JSON.stringify({ text: 'North gate.' }), { status: 200 }))
    await vi.advanceTimersByTimeAsync(6_000)
    await vi.advanceTimersByTimeAsync(6_000)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    await expect((fetchMock.mock.calls[1][1].body as Blob).text()).resolves.toBe('current')
    await expect((fetchMock.mock.calls[2][1].body as Blob).text()).resolves.toBe('newest')
  })
})
