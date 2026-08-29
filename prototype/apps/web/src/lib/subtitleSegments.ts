type SubtitleLanguage = 'en' | 'th'

const MAX_CHARACTERS: Record<SubtitleLanguage, number> = {
  en: 160,
  th: 80,
}

function languageFor(text: string, language?: SubtitleLanguage): SubtitleLanguage {
  if (language) return language
  return /[\u0E00-\u0E7F]/.test(text) ? 'th' : 'en'
}

function splitAtWordBoundaries(text: string, maximum: number, locale: SubtitleLanguage): string[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'word' })
  const words = Array.from(segmenter.segment(text), ({ segment, isWordLike }) => ({ segment, isWordLike }))
  const result: string[] = []
  let current = ''

  for (const word of words) {
    const next = `${current}${word.segment}`
    if (current && word.isWordLike && next.trim().length > maximum) {
      result.push(current.trim())
      current = word.segment.trimStart()
      continue
    }
    current = next
  }

  if (current.trim()) result.push(current.trim())
  return result
}

function splitSentence(sentence: string, maximum: number, locale: SubtitleLanguage): string[] {
  if (sentence.length <= maximum) return [sentence]

  const naturalBreak = Math.max(
    sentence.lastIndexOf(',', maximum),
    sentence.lastIndexOf(';', maximum),
    sentence.lastIndexOf(':', maximum),
  )
  if (naturalBreak > maximum / 2) {
    return [
      sentence.slice(0, naturalBreak + 1).trim(),
      ...splitSentence(sentence.slice(naturalBreak + 1).trim(), maximum, locale),
    ]
  }

  return splitAtWordBoundaries(sentence, maximum, locale)
}

function packCaptionLines(segments: string[], maximum: number): string[] {
  const captions: string[] = []
  let current = ''

  for (const segment of segments) {
    const next = current ? `${current} ${segment}` : segment
    if (current && next.length > maximum) {
      captions.push(current)
      current = segment
      continue
    }
    current = next
  }

  if (current) captions.push(current)
  return captions
}

export function splitSubtitleSegments(transcript: string, language?: SubtitleLanguage): string[] {
  const text = transcript.replace(/\s+/g, ' ').trim()
  if (!text) return []

  const locale = languageFor(text, language)
  const maximum = MAX_CHARACTERS[locale]
  if (locale === 'th') return splitAtWordBoundaries(text, maximum, locale)

  const sentencePieces = (text.match(/[^.!?…]+[.!?…]?/g) ?? [text])
    .flatMap((sentence) => splitSentence(sentence.trim(), maximum, locale))
    .filter(Boolean)
  return packCaptionLines(sentencePieces, maximum)
}
