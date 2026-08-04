import { describe, expect, it } from 'vitest'
import { edgeDatumMemberCenters, supportAwarePanelSegments } from './framingLayout'

describe('shared framing layout', () => {
  it('measures interior framing from the outside structural edge', () => {
    expect(edgeDatumMemberCenters(96, 96, 16)).toEqual([-47.25, -32, -16, 0, 16, 32, 47.25])
  })

  it('keeps butted side-wall framing on the building datum', () => {
    expect(edgeDatumMemberCenters(120, 113, 16)).toEqual([
      -55.75, -44, -28, -12, 4, 20, 36, 52, 55.75,
    ])
  })

  it('places panel ends only on support lines and honors stagger preferences', () => {
    const supports = edgeDatumMemberCenters(120, 120, 16)

    expect(supportAwarePanelSegments(120, 96, supports, 96)).toEqual([
      { start: -60, end: 36 },
      { start: 36, end: 60 },
    ])
    expect(supportAwarePanelSegments(120, 96, supports, 48)).toEqual([
      { start: -60, end: -12 },
      { start: -12, end: 60 },
    ])
  })
})
