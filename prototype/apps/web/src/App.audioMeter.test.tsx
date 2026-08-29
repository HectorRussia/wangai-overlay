import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

let emitLevel: ((level: number) => void) | undefined

vi.mock('./lib/audioMeter', () => ({
  startAudioMeter: vi.fn((_stream, onLevel) => {
    emitLevel = onLevel
    return { stop: vi.fn() }
  }),
}))
vi.mock('./lib/chunkedStt', () => ({
  startChunkedStt: vi.fn().mockResolvedValue({ finalize: vi.fn(), setSending: vi.fn(), stop: vi.fn() }),
}))

import App from './App'
import type { BrowserCapabilityReport } from './lib/capabilities'

const report: BrowserCapabilityReport = {
  blockers: [], canOpenFloatingWidget: false, canStartSession: true, copyBehavior: 'available', floatingWidgetBehavior: 'fallback',
}

describe('shared-audio meter', () => {
  it('makes incoming sound availability visible without exposing raw audio', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Share audio' }))
    expect(await screen.findByText('Audio input: waiting for sound')).toBeVisible()

    await act(async () => { emitLevel?.(0.6) })
    expect(screen.getByText('Audio input: sound detected')).toBeVisible()
  })
})
