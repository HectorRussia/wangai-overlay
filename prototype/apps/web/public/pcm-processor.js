class WaNgaiPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = []
    this.targetRate = 16000
  }

  process(inputs) {
    const input = inputs[0]?.[0]
    if (!input) return true

    const ratio = sampleRate / this.targetRate
    for (let offset = 0; offset < input.length; offset += ratio) {
      const sample = Math.max(-1, Math.min(1, input[Math.floor(offset)] ?? 0))
      this.samples.push(sample < 0 ? sample * 0x8000 : sample * 0x7fff)
      if (this.samples.length === 1600) {
        const pcm = new Int16Array(this.samples)
        this.samples = []
        this.port.postMessage(pcm.buffer, [pcm.buffer])
      }
    }
    return true
  }
}

registerProcessor('wa-ngai-pcm', WaNgaiPcmProcessor)
