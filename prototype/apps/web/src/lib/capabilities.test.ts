import { describe, expect, it } from 'vitest'

import { assessBrowserCapabilities } from './capabilities'

describe('assessBrowserCapabilities', () => {
  it('marks the core session ready when secure capture APIs exist', () => {
    const report = assessBrowserCapabilities({
      secureContext: true,
      hasDisplayCapture: true,
      hasMicrophoneCapture: true,
      hasDocumentPictureInPicture: true,
      hasClipboardWrite: true,
    })

    expect(report.canStartSession).toBe(true)
    expect(report.canOpenFloatingWidget).toBe(true)
    expect(report.copyBehavior).toBe('available')
  })

  it('explains why an insecure browser cannot start capture', () => {
    const report = assessBrowserCapabilities({
      secureContext: false,
      hasDisplayCapture: true,
      hasMicrophoneCapture: true,
      hasDocumentPictureInPicture: false,
      hasClipboardWrite: false,
    })

    expect(report.canStartSession).toBe(false)
    expect(report.blockers).toContain('Open WANGAI over HTTPS to use audio capture.')
    expect(report.floatingWidgetBehavior).toBe('fallback')
  })

  it('keeps the session usable when Document PiP is unavailable', () => {
    const report = assessBrowserCapabilities({
      secureContext: true,
      hasDisplayCapture: true,
      hasMicrophoneCapture: true,
      hasDocumentPictureInPicture: false,
      hasClipboardWrite: true,
    })

    expect(report.canStartSession).toBe(true)
    expect(report.canOpenFloatingWidget).toBe(false)
    expect(report.floatingWidgetBehavior).toBe('fallback')
  })
})
