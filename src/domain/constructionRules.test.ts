import { describe, expect, it } from 'vitest'
import {
  constructionRules,
  standardEightFootWallHeightIn,
  wallPanelLayoutSpan,
} from './constructionRules'

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

  it('derives the standard eight-foot wall from precut studs and three plates', () => {
    expect(constructionRules.walls.standardEightFootStudIn).toBe(92 + 5 / 8)
    expect(standardEightFootWallHeightIn).toBe(97 + 1 / 8)
  })

  it('keeps untreated envelope layers above the modeled grade plane', () => {
    expect(constructionRules.site.minimumUntreatedWoodClearanceIn).toBe(6)
    expect(constructionRules.walls.rimCoverage).toBe('clearance-limited')
  })
})
