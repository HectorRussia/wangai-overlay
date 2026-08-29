import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { startChunkedStt } = vi.hoisted(() => ({
  startChunkedStt: vi.fn().mockResolvedValue({ finalize: vi.fn(), setSending: vi.fn(), stop: vi.fn() }),
}))

vi.mock('./lib/chunkedStt', () => ({ startChunkedStt }))

import App from './App'
import type { BrowserCapabilityReport } from './lib/capabilities'

const report: BrowserCapabilityReport = {
  blockers: [], canOpenFloatingWidget: false, canStartSession: true, copyBehavior: 'available', floatingWidgetBehavior: 'fallback',
}

describe('incoming audio profile', () => {
  it('uses the selected Discord profile when starting shared audio', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('MediaRecorder', class {})
    vi.stubGlobal('MediaStream', class {})

    render(
      <App
        capabilityReport={report}
        mediaDevices={{
          getDisplayMedia: vi.fn().mockResolvedValue({ getAudioTracks: () => [{}], getTracks: () => [{}] }),
          getUserMedia: vi.fn(),
        } as never}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.selectOptions(screen.getByLabelText('Incoming audio'), 'discord')
    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Share audio' }))

    expect(startChunkedStt).toHaveBeenCalledWith(expect.anything(), 'en', expect.any(Function), expect.objectContaining({ vadProfile: 'discord' }))
  })
})
