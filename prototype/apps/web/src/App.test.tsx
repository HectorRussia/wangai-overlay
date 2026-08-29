import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from './App'
import type { BrowserCapabilityReport } from './lib/capabilities'

const readyReport: BrowserCapabilityReport = {
  blockers: [],
  canOpenFloatingWidget: true,
  canStartSession: true,
  copyBehavior: 'available',
  floatingWidgetBehavior: 'picture-in-picture',
}

const supportedMediaDevices = {
  getDisplayMedia: vi.fn(),
  getUserMedia: vi.fn(),
}

describe('WANGAI feasibility harness', () => {
  it('starts setup without exposing provider setup to the user', async () => {
    const user = userEvent.setup()

    render(<App capabilityReport={readyReport} mediaDevices={supportedMediaDevices as never} />)

    expect(screen.getByRole('heading', { name: 'WA-NGAI ว่าไง' })).toBeVisible()
    expect(screen.queryByText('xAI API key')).not.toBeInTheDocument()
    expect(screen.queryByText('External audio only')).not.toBeInTheDocument()
    expect(screen.queryByText('No game hooks')).not.toBeInTheDocument()
    expect(screen.queryByText('Private')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveClass('settings-button')

    await user.click(screen.getByRole('button', { name: 'Start session' }))

    expect(screen.getByRole('button', { name: 'Share audio' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Enable microphone' })).toBeVisible()
  })

  it('shows listening state after system audio is granted', async () => {
    const user = userEvent.setup()
    const audioTrack = { readyState: 'live' as const, stop: vi.fn() }
    const displayTrack = { readyState: 'live' as const, stop: vi.fn() }
    const getDisplayMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [audioTrack],
      getTracks: () => [audioTrack, displayTrack],
    })
    const getUserMedia = vi.fn()

    render(
      <App
        capabilityReport={readyReport}
        mediaDevices={{ getDisplayMedia, getUserMedia } as never}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Share audio' }))

    expect(await screen.findByText('Listening to shared audio')).toBeVisible()
    expect(getDisplayMedia).toHaveBeenCalledOnce()
  })

  it('starts and stops the Thai push-to-talk control only after microphone permission is granted', async () => {
    const user = userEvent.setup()
    const microphoneTrack = { readyState: 'live' as const, stop: vi.fn() }
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [microphoneTrack],
      getTracks: () => [microphoneTrack],
    })

    render(
      <App
        capabilityReport={readyReport}
        mediaDevices={{ getDisplayMedia: vi.fn(), getUserMedia } as never}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    expect(screen.queryByRole('button', { name: 'Hold to speak Thai' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enable microphone' }))
    const pttButton = await screen.findByRole('button', { name: 'Hold to speak Thai' })
    expect(screen.getByText('Your Thai text appears first. Translation follows.')).toBeVisible()

    await user.pointer([{ keys: '[MouseLeft>]', target: pttButton }])
    expect(screen.getByRole('button', { name: 'Listening in Thai' })).toBeVisible()

    await user.pointer([{ keys: '[/MouseLeft]' }])
    expect(screen.getByRole('button', { name: 'Hold to speak Thai' })).toBeVisible()
  })

  it('lets the player choose languages and save a focused-window shortcut from compact settings', async () => {
    const user = userEvent.setup()

    render(<App capabilityReport={readyReport} mediaDevices={supportedMediaDevices as never} />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.queryByLabelText('Game terms')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('They speak'), 'th')
    await user.selectOptions(screen.getByLabelText('I speak'), 'en')

    expect(screen.queryByText('Thai → English')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Set shortcut' }))
    await user.keyboard('v')

    expect(screen.getByRole('button', { name: 'Shortcut V' })).toBeVisible()
  })

  it('uses the configured shortcut for push-to-talk while WA-NGAI has focus', async () => {
    const user = userEvent.setup()
    const microphoneTrack = { readyState: 'live' as const, stop: vi.fn() }
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [microphoneTrack],
      getTracks: () => [microphoneTrack],
    })

    render(
      <App
        capabilityReport={readyReport}
        mediaDevices={{ getDisplayMedia: vi.fn(), getUserMedia } as never}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Enable microphone' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Set shortcut' }))
    await user.keyboard('v')

    fireEvent.keyDown(window, { key: 'v' })
    expect(screen.getByRole('button', { name: 'Listening in Thai' })).toBeVisible()

    fireEvent.keyUp(window, { key: 'v' })
    expect(screen.getByRole('button', { name: 'Hold to speak Thai' })).toBeVisible()
  })

  it('uses the configured shortcut while the floating PiP window has focus', async () => {
    const user = userEvent.setup()
    const microphoneTrack = { readyState: 'live' as const, stop: vi.fn() }
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [microphoneTrack],
      getTracks: () => [microphoneTrack],
    })
    const pipEventTarget = new EventTarget()
    const addEventListener = vi.spyOn(pipEventTarget, 'addEventListener')
    const pipWindow = Object.assign(pipEventTarget, {
      closed: false,
      document: document.implementation.createHTMLDocument('WANGAI'),
    }) as unknown as Window

    render(
      <App
        capabilityReport={readyReport}
        mediaDevices={{ getDisplayMedia: vi.fn(), getUserMedia } as never}
        pictureInPictureApi={{ requestWindow: vi.fn().mockResolvedValue(pipWindow) }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Enable microphone' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Set shortcut' }))
    await user.keyboard('v')
    await user.click(screen.getByRole('button', { name: 'Open overlay' }))
    await waitFor(() => expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function)))

    act(() => pipWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' })))
    expect(screen.getByRole('button', { name: 'Listening in Thai' })).toBeVisible()

    act(() => pipWindow.dispatchEvent(new KeyboardEvent('keyup', { key: 'v' })))
    expect(screen.getByRole('button', { name: 'Hold to speak Thai' })).toBeVisible()
  })

  it('opens a compact floating widget only from an explicit user action', async () => {
    const user = userEvent.setup()
    const requestWindow = vi.fn().mockResolvedValue({
      document: document.implementation.createHTMLDocument('WANGAI'),
    })

    render(
      <App
        capabilityReport={readyReport}
        mediaDevices={supportedMediaDevices as never}
        pictureInPictureApi={{ requestWindow }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Open overlay' }))

    expect(requestWindow).toHaveBeenCalledOnce()
  })

  it('recovers cleanly when a user shares a surface without audio', async () => {
    const user = userEvent.setup()
    const displayTrack = { readyState: 'live' as const, stop: vi.fn() }
    const getDisplayMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [],
      getTracks: () => [displayTrack],
    })

    render(
      <App
        capabilityReport={readyReport}
        mediaDevices={{ getDisplayMedia, getUserMedia: vi.fn() } as never}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Share audio' }))

    expect(await screen.findByText('No audio track arrived. Share a screen and enable Share system audio.')).toBeVisible()
    expect(displayTrack.stop).toHaveBeenCalledOnce()
  })

  it('ends a session by stopping the shared and microphone tracks', async () => {
    const user = userEvent.setup()
    const sharedTrack = { readyState: 'live' as const, stop: vi.fn() }
    const displayTrack = { readyState: 'live' as const, stop: vi.fn() }
    const microphoneTrack = { readyState: 'live' as const, stop: vi.fn() }

    render(
      <App
        capabilityReport={readyReport}
        mediaDevices={{
          getDisplayMedia: vi.fn().mockResolvedValue({
            getAudioTracks: () => [sharedTrack],
            getTracks: () => [sharedTrack, displayTrack],
          }),
          getUserMedia: vi.fn().mockResolvedValue({
            getAudioTracks: () => [microphoneTrack],
            getTracks: () => [microphoneTrack],
          }),
        } as never}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Share audio' }))
    await user.click(screen.getByRole('button', { name: 'Enable microphone' }))
    await user.click(screen.getByRole('button', { name: 'End session' }))

    expect(sharedTrack.stop).toHaveBeenCalledOnce()
    expect(displayTrack.stop).toHaveBeenCalledOnce()
    expect(microphoneTrack.stop).toHaveBeenCalledOnce()
    expect(await screen.findByText('Session ended. Audio capture is off.')).toBeVisible()
  })
})
