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

  it('butts wall framing at square corners and closes the exterior layers', () => {
    const building = generateBuilding(referenceDesign)
    const frontPlate = building.members.find((member) => member.label === 'front bottom plate')
    const rightPlate = building.members.find((member) => member.label === 'right bottom plate')
    const frontSheathing = building.members.filter(
      (member) => member.label === 'front wall sheathing',
    )
    const rightSheathing = building.members.find(
      (member) => member.label === 'right wall sheathing',
    )

    expect(frontPlate).toBeDefined()
    expect(rightPlate).toBeDefined()
    expect(frontPlate?.position[2]).toBeCloseTo(58.25)
    expect(rightPlate?.position[0]).toBeCloseTo(46.25)
    expect((rightPlate?.size[2] ?? 0) / 2).toBeCloseTo(
      (frontPlate?.position[2] ?? 0) - (frontPlate?.size[2] ?? 0) / 2,
    )

    const frontSheathingRightEdge = Math.max(
      ...frontSheathing.map((member) => member.position[0] + member.size[0] / 2),
    )
    const rightSheathingInnerFace =
      (rightSheathing?.position[0] ?? 0) - (rightSheathing?.size[0] ?? 0) / 2
    expect(frontSheathingRightEdge).toBeGreaterThanOrEqual(rightSheathingInnerFace)
  })

  it('lands rafters on both gable walls and supports the rake overhang', () => {
    const building = generateBuilding(referenceDesign)
    const gableRafters = building.members.filter((member) => member.label.includes('gable rafter'))
    const flyRafters = building.members.filter((member) => member.id.startsWith('fly-rafter-'))
    const lookouts = building.members.filter((member) => member.id.startsWith('rake-lookout-'))
    const roofSheathing = building.members.find((member) => member.label === 'Left roof sheathing')

    expect(gableRafters).toHaveLength(4)
    expect(new Set(gableRafters.map((member) => Math.abs(member.position[2])))).toEqual(
      new Set([59.25]),
    )
    expect(flyRafters).toHaveLength(4)
    expect(lookouts).toHaveLength(12)
    expect(roofSheathing?.size[2]).toBe(144)
    expect(Math.abs(flyRafters[0].position[2]) + flyRafters[0].size[2] / 2).toBeCloseTo(
      (roofSheathing?.size[2] ?? 0) / 2,
    )
  })
})
