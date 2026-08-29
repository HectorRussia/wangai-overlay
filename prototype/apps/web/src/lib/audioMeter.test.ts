import { describe, expect, it } from 'vitest'

import { getAudioLevel } from './audioMeter'

describe('getAudioLevel', () => {
  it('returns zero for silence and a normalized level for audible samples', () => {
    expect(getAudioLevel(new Uint8Array([128, 128, 128, 128]))).toBe(0)
    expect(getAudioLevel(new Uint8Array([128, 255, 1, 128]))).toBeGreaterThan(0.9)
  })
})
