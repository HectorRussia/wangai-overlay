import { describe, expect, it } from 'vitest'

import { createSpeechSegmentBlob } from './speechSegment'

describe('createSpeechSegmentBlob', () => {
  it('encodes a 16kHz mono WAV segment that Groq can receive directly', async () => {
    const blob = createSpeechSegmentBlob(new Float32Array([0, 0.5, -0.5]))
    const bytes = new Uint8Array(await blob.arrayBuffer())

    expect(blob.type).toBe('audio/wav')
    expect(bytes.length).toBe(50)
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE')
  })
})
