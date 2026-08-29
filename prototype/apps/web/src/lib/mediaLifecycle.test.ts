import { describe, expect, it } from 'vitest'

import { stopSessionMedia } from './mediaLifecycle'

describe('stopSessionMedia', () => {
  it('stops every live track and closes the audio context', async () => {
    const stopped: string[] = []
    const closed: string[] = []

    await stopSessionMedia(
      [
        { readyState: 'live', stop: () => stopped.push('system-audio') },
        { readyState: 'ended', stop: () => stopped.push('ended-track') },
        { readyState: 'live', stop: () => stopped.push('microphone') },
      ],
      { close: async () => closed.push('audio-context') },
    )

    expect(stopped).toEqual(['system-audio', 'microphone'])
    expect(closed).toEqual(['audio-context'])
  })

  it('does not fail cleanup when no capture has started', async () => {
    await expect(stopSessionMedia([], undefined)).resolves.toBeUndefined()
  })
})
