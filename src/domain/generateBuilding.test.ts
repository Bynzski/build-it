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

  it('profiles common rafters with flush ridge, birdsmouth, and tail cuts', () => {
    const building = generateBuilding(referenceDesign)
    const rafters = building.members.filter(
      (member) => member.id.startsWith('rafter-') && !member.id.startsWith('rafter-tie-'),
    )
    const rightRafter = rafters.find((member) => member.position[0] > 0)
    const profileWorldX = rightRafter?.profile?.map(([x]) => x + rightRafter.position[0]) ?? []
    const birdsmouth = rightRafter?.fabrication?.cuts.find((cut) => cut.type === 'birdsmouth')

    expect(rightRafter?.shape).toBe('profile')
    expect(Math.min(...profileWorldX)).toBeCloseTo(0.75)
    expect(rightRafter?.rotation).toBeUndefined()
    expect(rightRafter?.fabrication?.cuts.map((cut) => cut.type)).toEqual([
      'plumb',
      'birdsmouth',
      'plumb',
    ])
    expect(rightRafter?.fabrication?.cuts[0].angleDeg).toBeCloseTo(26.565, 2)
    expect(birdsmouth?.seatLengthIn).toBeCloseTo(3.5)
    expect(birdsmouth?.depthIn).toBeCloseTo(1.565, 2)
  })

  it('adds tied rafter pairs and slope-cut gable studs', () => {
    const building = generateBuilding(referenceDesign)
    const rafters = building.members.filter(
      (member) => member.id.startsWith('rafter-') && !member.id.startsWith('rafter-tie-'),
    )
    const ties = building.members.filter((member) => member.id.startsWith('rafter-tie-'))
    const gableStuds = building.members.filter((member) => member.id.startsWith('gable-stud-'))

    expect(ties).toHaveLength(rafters.length / 2)
    expect(ties.every((member) => member.materialId === '2x4')).toBe(true)
    expect(gableStuds.every((member) => member.shape === 'profile')).toBe(true)
    expect(
      gableStuds.some((member) => member.fabrication?.cuts.some((cut) => cut.type === 'slope')),
    ).toBe(true)
  })

  it('selects a ridge board deep enough for steep rafter cut ends', () => {
    const steep = cloneProject(referenceDesign)
    steep.roof.pitchRise = 12
    steep.roof.rafterSize = '2x8'
    const building = generateBuilding(steep)
    const ridge = building.members.find((member) => member.id.startsWith('ridge-board-'))
    const rafter = building.members.find((member) => member.id.startsWith('rafter-'))
    const birdsmouth = rafter?.fabrication?.cuts.find((cut) => cut.type === 'birdsmouth')

    expect(ridge?.materialId).toBe('2x12')
    expect(birdsmouth?.seatLengthIn).toBeGreaterThanOrEqual(1.5)
    expect(birdsmouth?.seatLengthIn).toBeLessThan(3.5)
    expect(birdsmouth?.depthIn).toBeLessThanOrEqual(7.25 / 3)
  })

  it('cuts rake lookouts to the clear distance between gable and fly rafters', () => {
    const building = generateBuilding(referenceDesign)
    const lookout = building.members.find(
      (member) => member.id.startsWith('rake-lookout-') && member.position[2] > 0,
    )
    const flyRafter = building.members.find(
      (member) => member.id.startsWith('fly-rafter-') && member.position[2] > 0,
    )

    expect(lookout?.cutLengthIn).toBeCloseTo(10.5)
    expect(lookout?.size[2]).toBeCloseTo(10.5)
    expect((lookout?.position[2] ?? 0) - (lookout?.size[2] ?? 0) / 2).toBeCloseTo(60)
    expect((lookout?.position[2] ?? 0) + (lookout?.size[2] ?? 0) / 2).toBeCloseTo(
      (flyRafter?.position[2] ?? 0) - (flyRafter?.size[2] ?? 0) / 2,
    )
    expect(lookout?.fabrication?.cuts.map((cut) => cut.type)).toEqual(['square', 'square'])
  })

  it('closes the floor perimeter with rim boards and butted joist ends', () => {
    const building = generateBuilding(referenceDesign)
    const leftRim = building.members.find((member) => member.label === 'Left floor rim board')
    const rightRim = building.members.find((member) => member.label === 'Right floor rim board')
    const frontJoist = building.members.find((member) => member.label === 'Front floor joist')
    const backJoist = building.members.find((member) => member.label === 'Back floor joist')

    expect(leftRim?.size[2]).toBe(120)
    expect(rightRim?.size[2]).toBe(120)
    expect(frontJoist?.size[0]).toBe(93)
    expect((frontJoist?.position[0] ?? 0) - (frontJoist?.size[0] ?? 0) / 2).toBeCloseTo(
      (leftRim?.position[0] ?? 0) + (leftRim?.size[0] ?? 0) / 2,
    )
    expect((frontJoist?.position[0] ?? 0) + (frontJoist?.size[0] ?? 0) / 2).toBeCloseTo(
      (rightRim?.position[0] ?? 0) - (rightRim?.size[0] ?? 0) / 2,
    )
    expect((frontJoist?.position[2] ?? 0) + (frontJoist?.size[2] ?? 0) / 2).toBe(60)
    expect((backJoist?.position[2] ?? 0) - (backJoist?.size[2] ?? 0) / 2).toBe(-60)
  })

  it('butts opening headers between king studs and window sills between jack studs', () => {
    const building = generateBuilding(referenceDesign)
    const doorHeaders = building.members.filter((member) => member.label === 'door header')
    const doorKings = building.members
      .filter((member) => member.label === 'door king stud')
      .sort((a, b) => a.position[0] - b.position[0])
    const windowSill = building.members.find((member) => member.label === 'Window sill')
    const windowJacks = building.members
      .filter((member) => member.label === 'window jack stud')
      .sort((a, b) => a.position[2] - b.position[2])

    expect(doorHeaders).toHaveLength(2)
    expect(doorHeaders[0].size[0]).toBe(39)
    expect(doorHeaders[0].position[0] - doorHeaders[0].size[0] / 2).toBeCloseTo(
      doorKings[0].position[0] + doorKings[0].size[0] / 2,
    )
    expect(doorHeaders[0].position[0] + doorHeaders[0].size[0] / 2).toBeCloseTo(
      doorKings[1].position[0] - doorKings[1].size[0] / 2,
    )
    expect(
      Math.min(...doorHeaders.map((member) => member.position[2] - member.size[2] / 2)),
    ).toBeCloseTo(doorKings[0].position[2] - doorKings[0].size[2] / 2)
    expect(
      Math.max(...doorHeaders.map((member) => member.position[2] + member.size[2] / 2)),
    ).toBeCloseTo(doorKings[0].position[2] + doorKings[0].size[2] / 2)
    expect(windowSill?.size[2]).toBe(24)
    expect((windowSill?.position[2] ?? 0) - (windowSill?.size[2] ?? 0) / 2).toBeCloseTo(
      windowJacks[0].position[2] + windowJacks[0].size[2] / 2,
    )
    expect((windowSill?.position[2] ?? 0) + (windowSill?.size[2] ?? 0) / 2).toBeCloseTo(
      windowJacks[1].position[2] - windowJacks[1].size[2] / 2,
    )
  })
})
