import { afterEach, describe, expect, it, vi } from 'vitest'

import { startLiveStt } from './liveStt'

class FakeProcessor {
  port: { onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null } = { onmessage: null }
  connect = vi.fn()
  disconnect = vi.fn()
}

class FakeSocket {
  static OPEN = 1
  static latest: FakeSocket | undefined
  binaryType = ''
  onmessage: ((event: MessageEvent) => void) | null = null
  readyState = FakeSocket.OPEN
  send = vi.fn()
  close = vi.fn()

  constructor() {
    FakeSocket.latest = this
  }
}

const processor = new FakeProcessor()

describe('startLiveStt', () => {
  afterEach(() => {
    FakeSocket.latest = undefined
    processor.port.onmessage = null
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('streams incoming audio immediately regardless of whether the source is English or Thai', async () => {
    const source = { connect: vi.fn(), disconnect: vi.fn() }
    const silentGain = { connect: vi.fn(), gain: { value: 1 } }
    const audioContext = {
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
      close: vi.fn().mockResolvedValue(undefined),
      createGain: vi.fn(() => silentGain),
      createMediaStreamSource: vi.fn(() => source),
    }
    function FakeAudioContext() {
      return audioContext
    }
    function FakeAudioWorkletNode() {
      return processor
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode)
    vi.stubGlobal('WebSocket', FakeSocket)

    await startLiveStt({} as MediaStream, 'th', vi.fn(), { sendingOnStart: true })
    processor.port.onmessage?.({ data: new ArrayBuffer(8) } as MessageEvent<ArrayBuffer>)

    expect(FakeSocket.latest?.send).toHaveBeenCalledWith(expect.any(ArrayBuffer))
  })

  it('keeps the microphone stream private until push-to-talk enables sending', async () => {
    const source = { connect: vi.fn(), disconnect: vi.fn() }
    const silentGain = { connect: vi.fn(), gain: { value: 1 } }
    const audioContext = {
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
      close: vi.fn().mockResolvedValue(undefined),
      createGain: vi.fn(() => silentGain),
      createMediaStreamSource: vi.fn(() => source),
    }
    function FakeAudioContext() { return audioContext }
    function FakeAudioWorkletNode() { return processor }
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode)
    vi.stubGlobal('WebSocket', FakeSocket)

    const session = await startLiveStt({} as MediaStream, 'th', vi.fn())
    processor.port.onmessage?.({ data: new ArrayBuffer(8) } as MessageEvent<ArrayBuffer>)
    expect(FakeSocket.latest?.send).not.toHaveBeenCalled()

    session.setSending(true)
    processor.port.onmessage?.({ data: new ArrayBuffer(8) } as MessageEvent<ArrayBuffer>)
    expect(FakeSocket.latest?.send).toHaveBeenCalledWith(expect.any(ArrayBuffer))
  })
})
