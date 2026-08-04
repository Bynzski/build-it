import { describe, expect, it } from 'vitest'
import { cloneProject, referenceDesign } from '../model/project'
import { generateBuilding } from './generateBuilding'

describe('construction generator', () => {
  it('deterministically generates the complete reference shed', () => {
    const first = generateBuilding(referenceDesign)
    const second = generateBuilding(referenceDesign)

    expect(first).toEqual(second)
    expect(first.metrics.footprintSqFt).toBe(80)
    expect(first.metrics.framingMemberCount).toBeGreaterThan(50)
    expect(first.members.filter((member) => member.assembly === 'foundation')).toHaveLength(3)
    expect(first.members.some((member) => member.id.startsWith('rafter-'))).toBe(true)
    expect(first.members.some((member) => member.id.startsWith('header-'))).toBe(true)
  })

  it('derives purchase quantities from generated assemblies', () => {
    const building = generateBuilding(referenceDesign)
    const lumber = building.shoppingList.filter((item) => item.purchaseLengthIn)
    const coverage = building.shoppingList.filter((item) => !item.purchaseLengthIn)

    expect(lumber.length).toBeGreaterThan(3)
    expect(coverage.some((item) => item.materialId === 'osb-7-16')).toBe(true)
    expect(coverage.some((item) => item.materialId === 'metal-roofing')).toBe(true)
    expect(building.breakdown.some((item) => item.assembly === 'walls')).toBe(true)
  })

  it('recalculates geometry and guidance when dimensions change', () => {
    const changed = cloneProject(referenceDesign)
    changed.dimensions.widthIn = 108
    const original = generateBuilding(referenceDesign)
    const building = generateBuilding(changed)

    expect(building.members).not.toEqual(original.members)
    expect(building.guidance).toContainEqual(
      expect.objectContaining({
        id: 'panel-fit-widthIn',
        suggestedValueIn: 96,
      }),
    )
  })

  it('blocks openings that extend beyond a wall', () => {
    const invalid = cloneProject(referenceDesign)
    invalid.openings[0].centerOffsetIn = 45
    const building = generateBuilding(invalid)

    expect(building.guidance).toContainEqual(
      expect.objectContaining({ level: 'blocked', id: 'outside-front-door' }),
    )
  })

  it('adds insulation and interior finish only when selected', () => {
    const living = cloneProject(referenceDesign)
    living.walls.insulationMaterialId = 'fiberglass-r13'
    living.walls.interiorMaterialId = 'drywall-1-2'
    const building = generateBuilding(living)

    expect(building.shoppingList.some((item) => item.materialId === 'fiberglass-r13')).toBe(true)
    expect(building.shoppingList.some((item) => item.materialId === 'drywall-1-2')).toBe(true)
  })
})
