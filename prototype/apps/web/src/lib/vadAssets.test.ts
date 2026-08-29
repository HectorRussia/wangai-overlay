import { describe, expect, it } from 'vitest'

import { vadStaticAssets } from './vadAssets'

describe('vadStaticAssets', () => {
  it('includes every local runtime file needed by the threaded ONNX VAD path', () => {
    expect(vadStaticAssets.map((asset) => asset.destination)).toEqual([
      'vad.worklet.bundle.min.js',
      'silero_vad_v5.onnx',
      'ort-wasm-simd-threaded.wasm',
      'ort-wasm-simd-threaded.mjs',
    ])
  })
})
