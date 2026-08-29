import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { startChunkedStt } = vi.hoisted(() => ({
  startChunkedStt: vi.fn(async (_stream, _language, onEvent) => {
    onEvent({ type: 'error' })
    return { finalize: vi.fn(), setSending: vi.fn(), stop: vi.fn() }
  }),
}))

vi.mock('./lib/chunkedStt', () => ({ startChunkedStt }))

import App from './App'
import type { BrowserCapabilityReport } from './lib/capabilities'

const report: BrowserCapabilityReport = {
  blockers: [], canOpenFloatingWidget: false, canStartSession: true, copyBehavior: 'available', floatingWidgetBehavior: 'fallback',
}

describe('shared-audio transcription failure', () => {
  it('keeps the capture connected and explains when a speech chunk cannot be transcribed', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('MediaRecorder', class {})
    vi.stubGlobal('MediaStream', class {})

    render(
      <App
        capabilityReport={report}
        mediaDevices={{
          getDisplayMedia: vi.fn().mockResolvedValue({
            getAudioTracks: () => [{ readyState: 'live', stop: vi.fn() }],
            getTracks: () => [{ readyState: 'live', stop: vi.fn() }],
          }),
          getUserMedia: vi.fn(),
        } as never}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Share audio' }))

    expect(await screen.findByText('Speech could not be transcribed. Shared audio is still connected.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Connected' })).toBeVisible()
  })
})
