import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { startLiveStt } = vi.hoisted(() => ({
  startLiveStt: vi.fn(async (_stream: MediaStream, _language: string, onEvent: (event: { type: string, text?: string, is_final?: boolean, speech_final?: boolean }) => void) => {
    onEvent({ type: 'transcript.partial', text: 'กำลังไป', is_final: true, speech_final: true })
    return { finalize: vi.fn(), setSending: vi.fn(), stop: vi.fn() }
  }),
}))

vi.mock('./lib/liveStt', () => ({ startLiveStt }))

import App from './App'
import type { BrowserCapabilityReport } from './lib/capabilities'

const report: BrowserCapabilityReport = {
  blockers: [], canOpenFloatingWidget: false, canStartSession: true, copyBehavior: 'available', floatingWidgetBehavior: 'fallback',
}

describe('reply composer', () => {
  it('lets the player revise the translated reply before copying it', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.stubGlobal('AudioContext', class {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      text: 'Walk to the left.',
      sourceText: 'เดินไปทางซ้าย',
    }), { status: 200 })))

    render(
      <App
        capabilityReport={report}
        mediaDevices={{
          getDisplayMedia: vi.fn(),
          getUserMedia: vi.fn().mockResolvedValue({ getAudioTracks: () => [{}], getTracks: () => [{}] }),
        } as never}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Enable microphone' }))
    expect(await screen.findByText('เดินไปทางซ้าย')).toBeInTheDocument()
    const editor = await screen.findByRole('textbox', { name: 'English reply' })
    await user.clear(editor)
    await user.type(editor, 'I am on my way.')
    await user.click(screen.getByRole('button', { name: 'Copy English' }))

    expect(writeText).toHaveBeenCalledWith('I am on my way.')
  })
})
