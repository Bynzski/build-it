import { describe, expect, it } from 'vitest'
import type { ConstructionMember } from './construction'
import { estimateMaterials } from './estimate'

function shortBlock(index: number): ConstructionMember {
  return {
    id: `block-${index}`,
    label: `Blocking ${index}`,
    assembly: 'walls',
    layer: 'framing',
    role: 'structure',
    scopeId: 'walls:front',
    scopeLabel: 'Front wall',
    kind: 'blocking',
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

  it('counts laid-out source sheets without crediting opening cutout area', () => {
    const result = estimateMaterials(
      [],
      [
        {
          id: 'wall-panels',
          label: 'Wall panels',
          assembly: 'walls',
          materialId: 'osb-7-16',
          areaSqIn: 0,
          sourceSheetCount: 2,
        },
        {
          id: 'gable-coverage',
          label: 'Gable coverage',
          assembly: 'walls',
          materialId: 'osb-7-16',
          areaSqIn: 32 * 144,
        },
      ],
      10,
    )

    expect(result.shoppingList).toContainEqual(
      expect.objectContaining({
        materialId: 'osb-7-16',
        count: 5,
        note: '2 laid-out source sheets · 35 sq ft coverage · including 10% waste',
      }),
    )
  })

  it('preserves exact layout-derived purchases without applying blanket waste', () => {
    const result = estimateMaterials(
      [],
      [
        {
          id: 'roof-panels',
          label: 'Roof panels',
          assembly: 'roof',
          materialId: 'metal-roofing',
          areaSqIn: 100 * 144,
          exactPurchaseCount: 8,
          purchaseLengthIn: 81.5,
          purchaseNote: 'Layout-derived panel count',
        },
      ],
      10,
    )

    expect(result.shoppingList).toContainEqual(
      expect.objectContaining({
        materialId: 'metal-roofing',
        count: 8,
        purchaseLengthIn: 81.5,
        note: 'Layout-derived panel count',
      }),
    )
  })

  it('combines consumable allowances and rounds them to purchasable packages', () => {
    const result = estimateMaterials([], [], 10, [
      {
        id: 'floor-sheathing-nails',
        label: 'Floor sheathing nails',
        assembly: 'floor',
        materialId: '8d-common-nails',
        requiredCount: 100,
        overagePct: 10,
        note: 'Floor schedule.',
      },
      {
        id: 'roof-sheathing-nails',
        label: 'Roof sheathing nails',
        assembly: 'roof',
        materialId: '8d-common-nails',
        requiredCount: 400,
        overagePct: 10,
        note: 'Roof schedule.',
      },
    ])

    expect(result.shoppingList).toContainEqual(
      expect.objectContaining({
        materialId: '8d-common-nails',
        count: 2,
        unit: 'approximately 500-count box',
        note: expect.stringContaining('Approximately 550 required'),
      }),
    )
    expect(result.breakdown).toContainEqual(
      expect.objectContaining({ assembly: 'floor', materialId: '8d-common-nails', count: 100 }),
    )
    expect(result.breakdown).toContainEqual(
      expect.objectContaining({ assembly: 'roof', materialId: '8d-common-nails', count: 400 }),
    )
  })
})
