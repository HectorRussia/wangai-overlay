import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

let emitIncoming: ((event: { type: string; text?: string; is_final?: boolean; speech_final?: boolean }) => void) | undefined

vi.mock('./lib/chunkedStt', () => ({
  startChunkedStt: vi.fn(async (_stream, _language, onEvent) => {
    emitIncoming = onEvent
    return { finalize: vi.fn(), setSending: vi.fn(), stop: vi.fn() }
  }),
}))

import App from './App'
import type { BrowserCapabilityReport } from './lib/capabilities'

const report: BrowserCapabilityReport = {
  blockers: [], canOpenFloatingWidget: false, canStartSession: true, copyBehavior: 'available', floatingWidgetBehavior: 'fallback',
}

describe('incoming translation context', () => {
  it('sends only previously committed speech as context for the next translation', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'ไปประตูเหนือ' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'กำลังไป' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
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

    await act(async () => { emitIncoming?.({ type: 'transcript.final', text: 'Meet at the north gate.', is_final: true, speech_final: true }) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await act(async () => { emitIncoming?.({ type: 'transcript.final', text: 'I am on my way.', is_final: true, speech_final: true }) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    expect(JSON.parse(fetchMock.mock.calls[1][1].body).context).toEqual(['Meet at the north gate.'])
  })

  it('translates a long incoming turn as continuous multi-line caption chunks', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'คำแปลสั้น' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
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

    await act(async () => {
      emitIncoming?.({
        type: 'transcript.final',
        text: 'The massive update for Mistrall Hunter has been live. I am going to show you all the tests between the skills so you can see what exactly has changed, as some of the nerfs are much bigger than we initially thought. Let us begin with Hammermerk.',
        is_final: true,
        speech_final: true,
      })
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).text).toBe('I am going to show you all the tests between the skills so you can see what exactly has changed, as some of the nerfs are much bigger than we initially thought.')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).context).toEqual(['The massive update for Mistrall Hunter has been live.'])
  })

  it('keeps the last completed translation readable while a newer English caption is translating', async () => {
    const user = userEvent.setup()
    let resolveSecondTranslation: ((response: Response) => void) | undefined
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'ไปประตูเหนือ' }), { status: 200 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSecondTranslation = resolve }))
    vi.stubGlobal('fetch', fetchMock)
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
    await act(async () => { await emitIncoming?.({ type: 'transcript.final', text: 'Meet at the north gate.', is_final: true, speech_final: true }) })
    await screen.findByText('ไปประตูเหนือ')

    act(() => { void emitIncoming?.({ type: 'transcript.final', text: 'The bridge is clear.', is_final: true, speech_final: true }) })
    await screen.findByText('The bridge is clear.')
    expect(screen.getByText('LIVE')).toBeVisible()
    expect(screen.getByText('ไปประตูเหนือ')).toBeVisible()

    await act(async () => { resolveSecondTranslation?.(new Response(JSON.stringify({ text: 'สะพานโล่ง' }), { status: 200 })) })
    await screen.findByText('สะพานโล่ง')
  })
})
