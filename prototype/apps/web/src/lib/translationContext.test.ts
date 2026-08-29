import { describe, expect, it } from 'vitest'

import { appendCommittedText } from './translationContext'

describe('appendCommittedText', () => {
  it('keeps a compact de-duplicated history of confirmed speech only', () => {
    const history = appendCommittedText(
      ['Meet at the north gate.', 'I need ammo.'],
      'Meet at the north gate.',
    )

    expect(history).toEqual(['I need ammo.', 'Meet at the north gate.'])
  })

  it('limits context to the most recent six short entries', () => {
    const history = appendCommittedText(
      Array.from({ length: 6 }, (_, index) => `line ${index}`),
      'x'.repeat(220),
    )

    expect(history).toHaveLength(6)
    expect(history.at(-1)).toHaveLength(180)
  })
})
