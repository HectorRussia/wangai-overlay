export type AudioMeter = {
  stop: () => void
}

export function getAudioLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0
  let peak = 0
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 127)
  return Math.min(1, peak)
}

export function startAudioMeter(stream: MediaStream, onLevel: (level: number) => void): AudioMeter | undefined {
  if (typeof AudioContext === 'undefined' || typeof requestAnimationFrame === 'undefined') return undefined

  const context = new AudioContext()
  const analyser = context.createAnalyser()
  const silentGain = context.createGain()
  const source = context.createMediaStreamSource(stream)
  const samples = new Uint8Array(analyser.fftSize)
  let frame = 0
  let stopped = false

  silentGain.gain.value = 0
  source.connect(analyser)
  analyser.connect(silentGain)
  silentGain.connect(context.destination)
  void context.resume()

  const readLevel = () => {
    if (stopped) return
    analyser.getByteTimeDomainData(samples)
    onLevel(getAudioLevel(samples))
    frame = requestAnimationFrame(readLevel)
  }
  frame = requestAnimationFrame(readLevel)

  return {
    stop: () => {
      stopped = true
      cancelAnimationFrame(frame)
      source.disconnect()
      analyser.disconnect()
      silentGain.disconnect()
      void context.close()
    },
  }
}
