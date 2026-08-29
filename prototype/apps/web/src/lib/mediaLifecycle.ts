export type SessionTrack = {
  readyState: 'live' | 'ended'
  stop: () => void
}

export type ClosableAudioContext = {
  close: () => Promise<unknown>
}

export async function stopSessionMedia(
  tracks: readonly SessionTrack[],
  audioContext?: ClosableAudioContext,
): Promise<void> {
  for (const track of tracks) {
    if (track.readyState === 'live') {
      track.stop()
    }
  }

  if (audioContext) {
    await audioContext.close()
  }
}
