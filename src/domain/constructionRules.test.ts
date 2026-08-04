import { describe, expect, it } from 'vitest'
import { constructionRules, wallPanelLayoutSpan } from './constructionRules'

describe('construction conventions', () => {
  it('treats authored dimensions as outside framing dimensions', () => {
    expect(constructionRules.dimensionReference).toBe('outside-framing')
  })

  it('keeps eight-foot end walls on a two-sheet layout', () => {
    expect(wallPanelLayoutSpan('front', 96, 'sheathing')).toBe(96)
    expect(wallPanelLayoutSpan('back', 96, 'siding')).toBe(96)
  })

  it('assigns the sheathing corner lap to the side walls', () => {
    expect(wallPanelLayoutSpan('left', 120, 'sheathing')).toBe(120 + 7 / 8)
    expect(wallPanelLayoutSpan('right', 120, 'siding')).toBe(120)
  })
})
