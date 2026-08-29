const MAX_AUDIO_BYTES = 3 * 1024 * 1024
const SUPPORTED_LANGUAGES = new Set(['en', 'th'])

function validateAudioInput({ audio, contentType, language, glossary }) {
  if (!Buffer.isBuffer(audio) || audio.length === 0 || audio.length > MAX_AUDIO_BYTES) {
    throw new TypeError('Audio chunk is invalid.')
  }
  if (typeof contentType !== 'string' || !/^audio\/(webm|ogg|wav)(?:;|$)/i.test(contentType)) {
    throw new TypeError('Audio content type is invalid.')
  }
  if (!SUPPORTED_LANGUAGES.has(language)) {
    throw new TypeError('Audio language is invalid.')
  }
  if (!Array.isArray(glossary) || glossary.length > 20 || glossary.some((term) => typeof term !== 'string' || term.length > 50)) {
    throw new TypeError('Glossary is invalid.')
  }
}

function baseAudioType(contentType) {
  return contentType.split(';', 1)[0].toLowerCase()
}

export async function transcribeWithGroq(
  { apiKey, fetchImpl = fetch, model = 'whisper-large-v3-turbo' },
  input,
) {
  if (!apiKey) throw new Error('Groq is not configured.')
  validateAudioInput(input)

  const form = new FormData()
  form.append('file', new Blob([input.audio], { type: baseAudioType(input.contentType) }), 'wa-ngai-chunk.webm')
  form.append('model', model)
  form.append('language', input.language)
  form.append('response_format', 'json')
  form.append('temperature', '0')
  if (input.glossary.length > 0) {
    form.append('prompt', `Game terms: ${input.glossary.join(', ')}`)
  }

  const response = await fetchImpl('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!response.ok) throw new Error('Groq transcription failed.')

  const payload = await response.json()
  if (typeof payload?.text !== 'string') throw new Error('Groq transcription response is invalid.')
  return { text: payload.text.trim() }
}
