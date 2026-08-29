import { stopSessionMedia, type SessionTrack } from './mediaLifecycle'

export type MediaStreamLike = {
  getAudioTracks: () => SessionTrack[]
  getTracks: () => SessionTrack[]
}

type WANGAIDisplayMediaOptions = DisplayMediaStreamOptions & {
  selfBrowserSurface?: 'exclude' | 'include'
  surfaceSwitching?: 'exclude' | 'include'
  systemAudio?: 'exclude' | 'include'
}

type CaptureApi = {
  getDisplayMedia: (options: WANGAIDisplayMediaOptions) => Promise<MediaStreamLike>
}

type MicrophoneApi = {
  getUserMedia: (options: MediaStreamConstraints) => Promise<MediaStreamLike>
}

export type AudioCapture = {
  audioTracks: SessionTrack[]
  allTracks: SessionTrack[]
  stream: MediaStreamLike
}

export class MissingSystemAudioTrackError extends Error {
  constructor() {
    super('The selected source did not include a system-audio track.')
    this.name = 'MissingSystemAudioTrackError'
  }
}

export async function requestSystemAudioCapture(
  api: CaptureApi,
): Promise<AudioCapture> {
  const stream = await api.getDisplayMedia({
    audio: true,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    systemAudio: 'include',
    video: true,
  })
  const audioTracks = stream.getAudioTracks()

  if (audioTracks.length === 0) {
    await stopSessionMedia(stream.getTracks())
    throw new MissingSystemAudioTrackError()
  }

  await stopSessionMedia(stream.getTracks().filter((track) => !audioTracks.includes(track)))
  return { audioTracks, allTracks: audioTracks, stream }
}

export async function requestMicrophoneCapture(
  api: MicrophoneApi,
): Promise<AudioCapture> {
  const stream = await api.getUserMedia({
    audio: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
    video: false,
  })

  return {
    audioTracks: stream.getAudioTracks(),
    allTracks: stream.getTracks(),
    stream,
  }
}
