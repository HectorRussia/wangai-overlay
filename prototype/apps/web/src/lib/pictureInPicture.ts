export type PictureInPictureApi = {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>
}

export type FloatingWidgetSnapshot = {
  incomingPreviousText?: string
  incomingPreviousTranslation?: string
  incomingText?: string
  incomingTranslation?: string
  incomingPendingText?: string
  systemAudioActive: boolean
  microphoneReady: boolean
  replyText?: string
  replyTranslation?: string
  pushToTalkActive?: boolean
}

const widgetStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..800&family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap');
  :root { color: #f7f7fb; font-family: "DM Sans", Inter, ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0; min-width: 0; background: #15161b; overflow: hidden; }
  [data-wangai-widget] { background: #15161b; border-radius: 0; box-sizing: border-box; min-height: 100vh; padding: 16px; }
  .topline { align-items: center; color: #9ea1ac; display: flex; font-size: 11px; font-weight: 700; justify-content: space-between; letter-spacing: .1em; }
  .live { align-items: center; color: #75d5a0; display: flex; font-size: 11px; gap: 6px; letter-spacing: 0; }
  .dot { background: #62ce90; border-radius: 50%; box-shadow: 0 0 0 3px rgba(98, 206, 144, .12); height: 7px; width: 7px; }
  .message { background: #22242c; border: 1px solid rgba(255, 255, 255, .06); border-radius: 13px; color: #f8f8fb; font-size: 14px; font-weight: 650; line-height: 1.35; margin-top: 13px; padding: 11px 12px; }
  .previous { opacity: .58; transform: translateY(-2px); }
  .translation { color: #a8aab4; display: block; font-size: 12px; font-weight: 400; margin-top: 4px; }
  :lang(th) { font-family: "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif; }
  .translation:lang(th), .message strong:lang(th) { color: #d1d4de; font-size: 13px; font-weight: 500; line-height: 1.65; }
  .pending { animation: incoming-arrive 220ms ease-out; border-left: 2px solid rgba(117, 213, 160, .72); color: #d7d9e0; padding-left: 10px; }
  .reply { background: #1d2922; display: table; margin-left: auto; max-width: calc(100% - 42px); text-align: right; }
  .reply.is-updating { animation: reply-refresh 220ms ease-out; }
  @keyframes incoming-arrive { from { opacity: .35; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes reply-refresh { from { opacity: .35; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .footer { display: flex; font-size: 11px; justify-content: space-between; margin-top: 12px; }
  .footer-status { align-items: center; color: #858995; display: inline-flex; gap: 6px; }
  .footer-status i { background: #51545f; border-radius: 50%; height: 6px; width: 6px; }
  .footer-status.is-active { color: #8bddac; }
  .footer-status.is-active i { background: #62ce90; box-shadow: 0 0 0 3px rgba(98, 206, 144, .1); }
`

export async function openFloatingWidget(
  api: PictureInPictureApi,
  snapshot: FloatingWidgetSnapshot,
): Promise<Window> {
  const pipWindow = await api.requestWindow({ width: 360, height: 220 })
  const { document } = pipWindow
  const style = document.createElement('style')
  style.textContent = widgetStyles

  const root = document.createElement('main')
  root.dataset.wangaiWidget = 'true'
  root.innerHTML = `
    <div class="topline"><span>WANGAI</span><span class="live"><span class="dot"></span>${snapshot.systemAudioActive ? 'Listening' : 'Ready'}</span></div>
    <div class="message previous" data-wangai-previous hidden><strong></strong><span class="translation"></span></div>
    <div class="message"><strong data-wangai-incoming>${snapshot.systemAudioActive ? 'Listening to shared audio' : 'Waiting for shared audio'}</strong><span class="translation" data-wangai-incoming-translation lang="th">${snapshot.systemAudioActive ? 'แปลข้อความเมื่อการเชื่อมต่อพร้อม' : 'เริ่มจากกดแชร์เสียงเกม'}</span></div>
    <div class="message pending" data-wangai-pending hidden><strong></strong><span class="translation">Translating…</span></div>
    <div class="message reply" data-wangai-reply hidden><strong></strong><span class="translation"></span></div>
    <div class="footer"><span class="footer-status" data-wangai-mic-status><i></i><span></span></span><span class="footer-status" data-wangai-audio-status><i></i><span></span></span><span class="footer-status" data-wangai-toggle-status><i></i><span></span></span></div>
  `

  document.title = 'WA-NGAI'
  document.body.replaceChildren(style, root)
  updateFloatingWidget(pipWindow, snapshot)

  return pipWindow
}

export function updateFloatingWidget(pipWindow: Window, snapshot: FloatingWidgetSnapshot): void {
  const document = pipWindow.document
  const incoming = document.querySelector<HTMLElement>('[data-wangai-incoming]')
  const incomingTranslation = document.querySelector<HTMLElement>('[data-wangai-incoming-translation]')
  const previous = document.querySelector<HTMLElement>('[data-wangai-previous]')
  const pending = document.querySelector<HTMLElement>('[data-wangai-pending]')
  const reply = document.querySelector<HTMLElement>('[data-wangai-reply]')
  const microphoneStatus = document.querySelector<HTMLElement>('[data-wangai-mic-status]')
  const audioStatus = document.querySelector<HTMLElement>('[data-wangai-audio-status]')
  const toggleStatus = document.querySelector<HTMLElement>('[data-wangai-toggle-status]')

  const hasPrevious = Boolean(snapshot.incomingPreviousText || snapshot.incomingPreviousTranslation)
  if (previous) {
    previous.hidden = !hasPrevious
    if (hasPrevious) {
      setWidgetText(previous.querySelector('strong')!, snapshot.incomingPreviousText ?? snapshot.incomingPreviousTranslation ?? '')
      setWidgetText(previous.querySelector('.translation')!, snapshot.incomingPreviousTranslation ?? '')
    }
  }
  if (incoming && snapshot.incomingText) setWidgetText(incoming, snapshot.incomingText)
  if (incomingTranslation) setWidgetText(incomingTranslation, snapshot.incomingTranslation ?? '')
  if (pending) {
    const hasPending = Boolean(snapshot.incomingPendingText)
    pending.hidden = !hasPending
    incoming?.closest<HTMLElement>('.message')?.toggleAttribute('hidden', hasPending)
    if (snapshot.incomingPendingText) setWidgetText(pending.querySelector('strong')!, snapshot.incomingPendingText)
  }
  if (reply) {
    const hasReply = Boolean(snapshot.replyText || snapshot.replyTranslation)
    reply.hidden = !hasReply
    if (hasReply) {
      const replyKey = `${snapshot.replyText ?? ''}\u0000${snapshot.replyTranslation ?? ''}`
      const replyChanged = reply.dataset.wangaiReplyKey !== replyKey
      setWidgetText(reply.querySelector('strong')!, snapshot.replyText ?? snapshot.replyTranslation ?? '')
      setWidgetText(reply.querySelector('.translation')!, snapshot.replyTranslation ?? '')
      if (replyChanged) {
        reply.dataset.wangaiReplyKey = replyKey
        reply.classList.remove('is-updating')
        void reply.offsetWidth
        reply.classList.add('is-updating')
      }
    }
  }
  if (microphoneStatus) setFooterStatus(microphoneStatus, 'Mic', snapshot.microphoneReady)
  if (audioStatus) setFooterStatus(audioStatus, 'Audio', snapshot.systemAudioActive)
  if (toggleStatus) setFooterStatus(toggleStatus, 'Toggle', Boolean(snapshot.pushToTalkActive))
}

function setFooterStatus(element: HTMLElement, label: string, active: boolean) {
  element.classList.toggle('is-active', active)
  const text = element.querySelector('span')
  if (text) text.textContent = `${label} ${active ? 'on' : 'off'}`
}

function setWidgetText(element: HTMLElement, text: string) {
  element.textContent = text
  if (/[\u0E00-\u0E7F]/.test(text)) element.lang = 'th'
  else element.removeAttribute('lang')
}
