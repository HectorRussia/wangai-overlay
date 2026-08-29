import { describe, expect, it, vi } from 'vitest'

import {
  MissingSystemAudioTrackError,
  requestMicrophoneCapture,
  requestSystemAudioCapture,
} from './capture'

describe('requestSystemAudioCapture', () => {
  it('requests a user-selected display with audio and returns its audio tracks', async () => {
    const audioTrack = { readyState: 'live' as const, stop: vi.fn() }
    const displayTrack = { readyState: 'live' as const, stop: vi.fn() }
    const getDisplayMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [audioTrack],
      getTracks: () => [audioTrack, displayTrack],
    })

    const capture = await requestSystemAudioCapture({ getDisplayMedia })

    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: true, systemAudio: 'include', video: true }),
    )
    expect(capture.audioTracks).toEqual([audioTrack])
    expect(capture.allTracks).toEqual([audioTrack])
    expect(displayTrack.stop).toHaveBeenCalledOnce()
    expect(audioTrack.stop).not.toHaveBeenCalled()
  })

  it('cleans up the selected surface when the browser returns no audio track', async () => {
    const displayTrack = { readyState: 'live' as const, stop: vi.fn() }
    const getDisplayMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [],
      getTracks: () => [displayTrack],
    })

    await expect(requestSystemAudioCapture({ getDisplayMedia })).rejects.toBeInstanceOf(
      MissingSystemAudioTrackError,
    )
    expect(displayTrack.stop).toHaveBeenCalledOnce()
  })
})

describe('requestMicrophoneCapture', () => {
  it('requests browser noise controls and returns microphone tracks', async () => {
    const microphoneTrack = { readyState: 'live' as const, stop: vi.fn() }
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [microphoneTrack],
      getTracks: () => [microphoneTrack],
    })

    const capture = await requestMicrophoneCapture({ getUserMedia })

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    })
    expect(capture.audioTracks).toEqual([microphoneTrack])
  })
})
