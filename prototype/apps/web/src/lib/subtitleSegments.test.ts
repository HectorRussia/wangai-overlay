import { describe, expect, it } from 'vitest'

import { splitSubtitleSegments } from './subtitleSegments'

describe('splitSubtitleSegments', () => {
  it('keeps a long English transcript in readable multi-line caption phrases', () => {
    const transcript = 'The massive update for Mistrall Hunter has been live. I am going to show you all the tests between the skills so you can see what exactly has changed, as some of the nerfs are much bigger than we initially thought. Let us begin with Hammermerk.'

    expect(splitSubtitleSegments(transcript)).toEqual([
      'The massive update for Mistrall Hunter has been live.',
      'I am going to show you all the tests between the skills so you can see what exactly has changed, as some of the nerfs are much bigger than we initially thought.',
      'Let us begin with Hammermerk.',
    ])
  })

  it('uses a readable multi-line limit for Thai without breaking words', () => {
    expect(splitSubtitleSegments('ตอนนี้เราจะไปทางซ้ายก่อนแล้วค่อยอ้อมไปช่วยเพื่อนที่ประตูเหนือ', 'th')).toEqual([
      'ตอนนี้เราจะไปทางซ้ายก่อนแล้วค่อยอ้อมไปช่วยเพื่อนที่ประตูเหนือ',
    ])
  })
})
