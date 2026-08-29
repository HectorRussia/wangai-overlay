import { describe, expect, it, vi } from 'vitest'

import { openFloatingWidget, updateFloatingWidget } from './pictureInPicture'

describe('openFloatingWidget', () => {
  it('opens a compact PiP window with the current session state', async () => {
    const pipDocument = document.implementation.createHTMLDocument('WANGAI')
    const requestWindow = vi.fn().mockResolvedValue({ document: pipDocument })

    await openFloatingWidget(
      { requestWindow },
      { microphoneReady: true, systemAudioActive: true },
    )

    expect(requestWindow).toHaveBeenCalledWith({ height: 220, width: 360 })
    expect(pipDocument.body.textContent).toContain('WANGAI')
    expect(pipDocument.querySelector('.topline')?.textContent).not.toContain('ว่าไง')
    expect(pipDocument.body.textContent).toContain('Listening to shared audio')
    expect(pipDocument.querySelector('[data-wangai-mic-status]')?.textContent).toContain('Mic on')
    expect(pipDocument.querySelector('[data-wangai-audio-status]')?.textContent).toContain('Audio on')
    expect(pipDocument.querySelector('[data-wangai-widget]')).not.toBeNull()
    expect(pipDocument.querySelector('style')?.textContent).toContain('body { margin: 0; min-width: 0; background: #15161b;')
    expect(pipDocument.querySelector('style')?.textContent).toContain('border-radius: 0;')
  })

  it('shows whether push-to-talk is toggled without making the PiP a control', async () => {
    const pipDocument = document.implementation.createHTMLDocument('WANGAI')

    const pipWindow = await openFloatingWidget(
      { requestWindow: vi.fn().mockResolvedValue({ document: pipDocument }) },
      { microphoneReady: true, pushToTalkActive: false, systemAudioActive: true },
    )

    const toggleStatus = pipDocument.querySelector<HTMLElement>('[data-wangai-toggle-status]')
    expect(toggleStatus?.textContent).toContain('Toggle off')
    expect(pipDocument.querySelector('[data-wangai-ptt-toggle]')).toBeNull()

    updateFloatingWidget(pipWindow, {
      microphoneReady: true,
      pushToTalkActive: true,
      systemAudioActive: true,
    })
    expect(toggleStatus?.textContent).toContain('Toggle on')
    expect(toggleStatus?.classList.contains('is-active')).toBe(true)
  })

  it('renders transcript updates as text, including a right-side reply', async () => {
    const pipDocument = document.implementation.createHTMLDocument('WA-NGAI')
    const pipWindow = { document: pipDocument, closed: false } as unknown as Window

    await openFloatingWidget(
      { requestWindow: vi.fn().mockResolvedValue(pipWindow) },
      { microphoneReady: true, systemAudioActive: true },
    )
    updateFloatingWidget(pipWindow, {
      incomingText: '<b>North gate</b>',
      incomingTranslation: 'ประตูเหนือ',
      microphoneReady: true,
      replyText: 'กำลังไป',
      replyTranslation: 'On my way.',
      systemAudioActive: true,
    })

    expect(pipDocument.querySelector('[data-wangai-incoming]')?.textContent).toBe('<b>North gate</b>')
    expect(pipDocument.body.textContent).toContain('ประตูเหนือ')
    expect(pipDocument.querySelector('[data-wangai-incoming-translation]')?.getAttribute('lang')).toBe('th')
    const reply = pipDocument.querySelector('[data-wangai-reply]')
    expect(reply?.querySelector('strong')?.textContent).toBe('กำลังไป')
    expect(reply?.querySelector('strong')?.getAttribute('lang')).toBe('th')
    expect(reply?.textContent).toContain('On my way.')
    expect(reply?.textContent).not.toContain('Translation')
    expect(reply?.hasAttribute('hidden')).toBe(false)
    expect(pipDocument.querySelector('style')?.textContent).toContain('display: table; margin-left: auto; max-width: calc(100% - 42px);')

    updateFloatingWidget(pipWindow, {
      incomingText: 'Bridge clear.',
      incomingPendingText: 'Enemy on the left.',
      microphoneReady: true,
      replyText: 'กำลังไป',
      replyTranslation: 'On my way.',
      systemAudioActive: true,
    })
    expect(pipDocument.querySelector('[data-wangai-incoming]')?.textContent).toBe('Bridge clear.')
    expect(pipDocument.querySelector('[data-wangai-pending]')?.textContent).toContain('Enemy on the left.')
    expect(pipDocument.querySelector('[data-wangai-pending]')?.hasAttribute('hidden')).toBe(false)
    expect(reply?.hasAttribute('hidden')).toBe(false)

    updateFloatingWidget(pipWindow, {
      microphoneReady: true,
      replyText: 'ไปทางซ้าย',
      replyTranslation: 'Go left.',
      systemAudioActive: true,
    })
    expect(pipDocument.querySelectorAll('[data-wangai-reply]')).toHaveLength(1)
    expect(reply?.querySelector('strong')?.textContent).toBe('ไปทางซ้าย')
    expect(reply?.classList.contains('is-updating')).toBe(true)

    updateFloatingWidget(pipWindow, {
      microphoneReady: false,
      systemAudioActive: false,
    })
    expect(pipDocument.querySelector('[data-wangai-mic-status]')?.textContent).toContain('Mic off')
    expect(pipDocument.querySelector('[data-wangai-audio-status]')?.textContent).toContain('Audio off')
  })

  it('keeps the previous partner translation above the latest live slot', async () => {
    const pipDocument = document.implementation.createHTMLDocument('WA-NGAI')
    const pipWindow = { document: pipDocument, closed: false } as unknown as Window

    await openFloatingWidget(
      { requestWindow: vi.fn().mockResolvedValue(pipWindow) },
      { microphoneReady: true, systemAudioActive: true },
    )
    updateFloatingWidget(pipWindow, {
      incomingPreviousText: 'Meet at the north gate.',
      incomingPreviousTranslation: 'เจอกันที่ประตูเหนือ',
      incomingPendingText: 'The bridge is clear.',
      microphoneReady: true,
      systemAudioActive: true,
    })

    const previous = pipDocument.querySelector<HTMLElement>('[data-wangai-previous]')
    const current = pipDocument.querySelector<HTMLElement>('[data-wangai-incoming]')
    const pending = pipDocument.querySelector<HTMLElement>('[data-wangai-pending]')
    expect(previous?.textContent).toContain('Meet at the north gate.')
    expect(previous?.textContent).toContain('เจอกันที่ประตูเหนือ')
    expect(previous?.hasAttribute('hidden')).toBe(false)
    expect(pending?.textContent).toContain('The bridge is clear.')
    expect(pending?.hasAttribute('hidden')).toBe(false)
    expect(current?.closest('.message')?.hasAttribute('hidden')).toBe(true)
    expect(pipDocument.querySelectorAll('.message:not([hidden])')).toHaveLength(2)
  })
})
