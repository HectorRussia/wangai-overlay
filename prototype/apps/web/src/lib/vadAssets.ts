export const vadStaticAssets = [
  {
    source: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
    destination: 'vad.worklet.bundle.min.js',
  },
  {
    source: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx',
    destination: 'silero_vad_v5.onnx',
  },
  {
    source: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
    destination: 'ort-wasm-simd-threaded.wasm',
  },
  {
    source: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
    destination: 'ort-wasm-simd-threaded.mjs',
  },
] as const
