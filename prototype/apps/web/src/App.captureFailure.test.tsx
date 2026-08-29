import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { startChunkedStt } = vi.hoisted(() => ({
  startChunkedStt: vi.fn().mockRejectedValue(new Error('VAD asset unavailable')),
}))

vi.mock('./lib/chunkedStt', () => ({ startChunkedStt }))

import App from './App'
import type { BrowserCapabilityReport } from './lib/capabilities'

const report: BrowserCapabilityReport = {
  blockers: [], canOpenFloatingWidget: false, canStartSession: true, copyBehavior: 'available', floatingWidgetBehavior: 'fallback',
}

describe('capture startup failure', () => {
  it('stops a granted shared-audio track when local VAD cannot initialize', async () => {
    const user = userEvent.setup()
    const audioTrack = { readyState: 'live' as const, stop: vi.fn() }
    const displayTrack = { readyState: 'live' as const, stop: vi.fn() }
    vi.stubGlobal('MediaRecorder', class {})
    vi.stubGlobal('MediaStream', class {})

    render(
      <App
        capabilityReport={report}
        mediaDevices={{
          getDisplayMedia: vi.fn().mockResolvedValue({
            getAudioTracks: () => [audioTrack],
            getTracks: () => [audioTrack, displayTrack],
          }),
          getUserMedia: vi.fn(),
        } as never}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Share audio' }))

    expect(await screen.findByText('Could not start shared audio. Try again.')).toBeVisible()
    expect(audioTrack.stop).toHaveBeenCalledOnce()
    expect(displayTrack.stop).toHaveBeenCalledOnce()
  })
})
