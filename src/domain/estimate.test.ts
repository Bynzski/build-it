import { describe, expect, it } from 'vitest'
import type { ConstructionMember } from './construction'
import { estimateMaterials } from './estimate'

function shortBlock(index: number): ConstructionMember {
  return {
    id: `block-${index}`,
    label: `Blocking ${index}`,
    assembly: 'walls',
    layer: 'framing',
    materialId: '2x4',
    size: [14.5, 1.5, 3.5],
    position: [0, 0, 0],
    cutLengthIn: 14.5,
  }
}

describe('material estimation', () => {
  it('packs short cuts into shared stock while preserving piece counts', () => {
    const result = estimateMaterials(
      Array.from({ length: 6 }, (_, index) => shortBlock(index)),
      [],
      10,
    )

    expect(result.shoppingList).toContainEqual(
      expect.objectContaining({ materialId: '2x4', count: 1, purchaseLengthIn: 96 }),
    )
    expect(result.breakdown).toContainEqual(
      expect.objectContaining({ assembly: 'walls', materialId: '2x4', count: 6 }),
    )
  })

  it('keeps near-full-length studs on individual boards', () => {
    const studs = Array.from({ length: 4 }, (_, index) => ({
      ...shortBlock(index),
      id: `stud-${index}`,
      cutLengthIn: 92 + 5 / 8,
    }))
    const result = estimateMaterials(studs, [], 10)

    expect(result.shoppingList).toContainEqual(
      expect.objectContaining({ materialId: '2x4', count: 4, purchaseLengthIn: 96 }),
    )
  })
})
