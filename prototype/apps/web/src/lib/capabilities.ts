export type BrowserCapabilityInput = {
  secureContext: boolean
  hasDisplayCapture: boolean
  hasMicrophoneCapture: boolean
  hasDocumentPictureInPicture: boolean
  hasClipboardWrite: boolean
}

export type BrowserCapabilityReport = {
  canStartSession: boolean
  canOpenFloatingWidget: boolean
  floatingWidgetBehavior: 'picture-in-picture' | 'fallback'
  copyBehavior: 'available' | 'manual-fallback'
  blockers: string[]
}

export function assessBrowserCapabilities(
  input: BrowserCapabilityInput,
): BrowserCapabilityReport {
  const blockers: string[] = []

  if (!input.secureContext) {
    blockers.push('Open WANGAI over HTTPS to use audio capture.')
  }

  if (!input.hasDisplayCapture) {
    blockers.push('This browser cannot request game or Discord audio sharing.')
  }

  if (!input.hasMicrophoneCapture) {
    blockers.push('This browser cannot request microphone access.')
  }

  const canStartSession =
    input.secureContext && input.hasDisplayCapture && input.hasMicrophoneCapture

  return {
    canStartSession,
    canOpenFloatingWidget: input.hasDocumentPictureInPicture,
    floatingWidgetBehavior: input.hasDocumentPictureInPicture
      ? 'picture-in-picture'
      : 'fallback',
    copyBehavior: input.hasClipboardWrite ? 'available' : 'manual-fallback',
    blockers,
  }
}

type BrowserNavigator = Pick<Navigator, 'mediaDevices' | 'clipboard'>

type BrowserWindow = {
  isSecureContext: boolean
  documentPictureInPicture?: unknown
  navigator: BrowserNavigator
}

export function detectBrowserCapabilities(
  browserWindow: BrowserWindow = window,
): BrowserCapabilityReport {
  return assessBrowserCapabilities({
    secureContext: browserWindow.isSecureContext,
    hasDisplayCapture:
      typeof browserWindow.navigator.mediaDevices?.getDisplayMedia === 'function',
    hasMicrophoneCapture:
      typeof browserWindow.navigator.mediaDevices?.getUserMedia === 'function',
    hasDocumentPictureInPicture:
      browserWindow.documentPictureInPicture !== undefined,
    hasClipboardWrite:
      typeof browserWindow.navigator.clipboard?.writeText === 'function',
  })
}
