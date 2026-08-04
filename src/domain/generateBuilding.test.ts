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

  it('recommends standard precut wall heights without warning on the reference preset', () => {
    const reference = generateBuilding(referenceDesign)
    const custom = cloneProject(referenceDesign)
    custom.dimensions.wallHeightIn = 96
    const changed = generateBuilding(custom)

    expect(reference.guidance.some((item) => item.field === 'wallHeightIn')).toBe(false)
    expect(changed.guidance).toContainEqual(
      expect.objectContaining({
        id: 'precut-fit-wallHeightIn',
        suggestedValueIn: 97 + 1 / 8,
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
    const frontSheathing = building.members.filter((member) =>
      member.label.startsWith('front wall sheathing panel'),
    )
    const rightSheathing = building.members.find((member) =>
      member.label.startsWith('right wall sheathing panel'),
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
    const roofSheathing = building.members.filter((member) =>
      member.label.startsWith('Left roof sheathing panel'),
    )
    const rafterCenters = building.members
      .filter((member) => member.id.startsWith('rafter-') && !member.id.startsWith('rafter-tie-'))
      .map((member) => member.position[2])

    expect(gableRafters).toHaveLength(4)
    expect(new Set(gableRafters.map((member) => Math.abs(member.position[2])))).toEqual(
      new Set([59.25]),
    )
    expect(flyRafters).toHaveLength(4)
    expect(lookouts).toHaveLength(12)
    expect(roofSheathing).toHaveLength(4)
    expect(roofSheathing.every((member) => member.size[0] <= 48)).toBe(true)
    expect(roofSheathing.every((member) => member.size[2] <= 96)).toBe(true)
    const roofCourses = [...new Set(roofSheathing.map((member) => member.position[0]))]
    const roofSeams = roofCourses.map((course) => {
      const panels = roofSheathing
        .filter((member) => member.position[0] === course)
        .sort((a, b) => a.position[2] - b.position[2])
      const firstEnd = panels[0].position[2] + panels[0].size[2] / 2
      const secondStart = panels[1].position[2] - panels[1].size[2] / 2
      return (firstEnd + secondStart) / 2
    })
    expect(roofSeams.sort((a, b) => a - b)).toEqual([-12, 20])
    expect(roofSeams.every((seam) => rafterCenters.includes(seam))).toBe(true)
    const sheathingEdge = Math.max(
      ...roofSheathing.map((member) => Math.abs(member.position[2]) + member.size[2] / 2),
    )
    expect(Math.abs(flyRafters[0].position[2]) + flyRafters[0].size[2] / 2).toBeCloseTo(
      sheathingEdge,
    )
  })

  it('lays out staggered 4x8 subfloor panels with explicit joints', () => {
    const building = generateBuilding(referenceDesign)
    const panels = building.members.filter((member) => member.id.startsWith('subfloor-panel-'))
    const joistCenters = building.members
      .filter((member) => member.id.startsWith('floor-joist-'))
      .map((member) => member.position[2])
    const rows = [...new Set(panels.map((member) => member.position[0]))].sort((a, b) => a - b)
    const seams = rows.map((row) => {
      const rowPanels = panels
        .filter((member) => member.position[0] === row)
        .sort((a, b) => a.position[2] - b.position[2])
      const firstEnd = rowPanels[0].position[2] + rowPanels[0].size[2] / 2
      const secondStart = rowPanels[1].position[2] - rowPanels[1].size[2] / 2
      return (firstEnd + secondStart) / 2
    })

    expect(panels).toHaveLength(4)
    expect(panels.every((member) => member.size[0] <= 48 && member.size[2] <= 96)).toBe(true)
    expect(seams).toEqual([36, -12])
    expect(seams.every((seam) => joistCenters.includes(seam))).toBe(true)
    expect(Math.abs(seams[0] - seams[1])).toBeGreaterThanOrEqual(referenceDesign.floor.spacingIn)
  })

  it('lays out 4x8 wall sheets and clips only the panels crossed by openings', () => {
    const building = generateBuilding(referenceDesign)
    const back = building.members
      .filter((member) => member.label.startsWith('back wall sheathing panel'))
      .filter((member) => member.size[1] > 90)
      .sort((a, b) => a.position[0] - b.position[0])
    const front = building.members.filter(
      (member) => member.label.startsWith('front wall sheathing panel') && member.position[1] > 20,
    )

    expect(back).toHaveLength(2)
    expect(back.every((member) => member.size[0] <= 48 && member.size[1] <= 96)).toBe(true)
    expect(back[1].position[0] - back[1].size[0] / 2).toBeCloseTo(
      back[0].position[0] + back[0].size[0] / 2 + 1 / 8,
    )
    expect(new Set(front.map((member) => member.label)).size).toBe(2)
    expect(front.length).toBeGreaterThan(2)
  })

  it('clips gable sheathing from a 4x8 panel grid', () => {
    const building = generateBuilding(referenceDesign)
    const panels = building.members.filter((member) =>
      member.label.startsWith('front gable sheathing panel'),
    )

    expect(panels).toHaveLength(2)
    expect(panels.every((member) => member.shape === 'profile')).toBe(true)
    expect(panels.every((member) => member.size[0] <= 48 && member.size[1] <= 48)).toBe(true)
  })

  it('uses side-wall sheathing for corner laps without creating an extra sheet', () => {
    const building = generateBuilding(referenceDesign)
    const endWallPanels = building.members.filter(
      (member) => member.label.startsWith('back wall sheathing panel') && member.size[1] > 90,
    )
    const sideWallPanels = building.members
      .filter(
        (member) => member.label.startsWith('right wall sheathing panel') && member.size[1] > 90,
      )
      .sort((a, b) => a.position[2] - b.position[2])

    expect(endWallPanels).toHaveLength(2)
    expect(sideWallPanels).toHaveLength(3)
    expect(sideWallPanels.at(-1)?.size[2]).toBeCloseTo(24 + 7 / 16 - 1 / 16)
    expect(sideWallPanels.every((member) => member.size[2] > 12)).toBe(true)
  })

  it('centers wall panel end joints over the common framing layout', () => {
    const building = generateBuilding(referenceDesign)
    const backPanels = building.members
      .filter(
        (member) => member.label.startsWith('back wall sheathing panel') && member.size[1] > 90,
      )
      .sort((a, b) => a.position[0] - b.position[0])
    const backStudCenters = building.members
      .filter((member) => member.label === 'back wall stud')
      .map((member) => member.position[0])
    const rightPanels = building.members
      .filter(
        (member) => member.label.startsWith('right wall sheathing panel') && member.size[1] > 90,
      )
      .sort((a, b) => a.position[2] - b.position[2])
    const rightStudCenters = building.members
      .filter((member) => member.label === 'right wall stud')
      .map((member) => member.position[2])

    const panelSeams = (panels: typeof backPanels, positionAxis: 0 | 2, sizeAxis: 0 | 2) =>
      panels.slice(0, -1).map((panel, index) => {
        const end = panel.position[positionAxis] + panel.size[sizeAxis] / 2
        const start =
          panels[index + 1].position[positionAxis] - panels[index + 1].size[sizeAxis] / 2
        return (end + start) / 2
      })

    expect(panelSeams(backPanels, 0, 0)).toEqual([0])
    expect(panelSeams(backPanels, 0, 0).every((seam) => backStudCenters.includes(seam))).toBe(true)
    expect(panelSeams(rightPanels, 2, 2)).toEqual([-12, 36])
    expect(panelSeams(rightPanels, 2, 2).every((seam) => rightStudCenters.includes(seam))).toBe(
      true,
    )
  })

  it('backs a panel seam where it meets the reference window opening', () => {
    const building = generateBuilding(referenceDesign)
    const lowerCripples = building.members.filter(
      (member) => member.label === 'Window lower cripple',
    )
    const seamBacking = lowerCripples.find((member) => member.position[2] === -11.25)
    const leftWindowJack = building.members.find(
      (member) => member.label === 'window jack stud' && member.position[2] < 0,
    )

    expect(leftWindowJack?.position[2]).toBe(-12.75)
    expect(seamBacking).toBeDefined()
    expect((leftWindowJack?.position[2] ?? 0) + 0.75).toBeCloseTo(
      (seamBacking?.position[2] ?? 0) - 0.75,
    )
  })

  it('covers the subfloor edge and rim with an offcut-sized lower panel course', () => {
    const building = generateBuilding(referenceDesign)
    const lowerBackPanels = building.members.filter(
      (member) => member.label.startsWith('back wall sheathing panel') && member.size[1] < 12,
    )
    const backFloorJoist = building.members.find((member) => member.label === 'Back floor joist')
    const upperBackPanels = building.members.filter(
      (member) => member.label.startsWith('back wall sheathing panel') && member.size[1] > 90,
    )
    const envelopeBottom = Math.min(
      ...lowerBackPanels.map((member) => member.position[1] - member.size[1] / 2),
    )
    const lowerCourseTop = Math.max(
      ...lowerBackPanels.map((member) => member.position[1] + member.size[1] / 2),
    )
    const upperCourseBottom = Math.min(
      ...upperBackPanels.map((member) => member.position[1] - member.size[1] / 2),
    )

    expect(lowerBackPanels).toHaveLength(2)
    expect(lowerBackPanels.every((member) => member.size[1] < 8)).toBe(true)
    const rimBottom = (backFloorJoist?.position[1] ?? 0) - (backFloorJoist?.size[1] ?? 0) / 2
    expect(envelopeBottom).toBe(6)
    expect(envelopeBottom - rimBottom).toBeCloseTo(0.5)
    expect(upperCourseBottom - lowerCourseTop).toBeCloseTo(1 / 8)
  })

  it('uses standard precut studs and flashes the horizontal siding joint', () => {
    const building = generateBuilding(referenceDesign)
    const wallStuds = building.members.filter((member) => member.id.startsWith('wall-stud-'))
    const flashing = building.members.filter((member) => member.id.startsWith('z-flashing-'))
    const backSiding = building.members.filter((member) =>
      member.label.startsWith('back wall siding panel'),
    )
    const lowerSidingTop = Math.max(
      ...backSiding
        .filter((member) => member.size[1] < 12)
        .map((member) => member.position[1] + member.size[1] / 2),
    )
    const upperSidingBottom = Math.min(
      ...backSiding
        .filter((member) => member.size[1] > 90)
        .map((member) => member.position[1] - member.size[1] / 2),
    )
    const flashingPurchase = building.shoppingList.find((item) => item.materialId === 'z-flashing')

    expect(wallStuds.every((member) => member.cutLengthIn === 92 + 5 / 8)).toBe(true)
    expect(flashing.length).toBeGreaterThanOrEqual(4)
    expect(flashing.every((member) => member.layer === 'finish')).toBe(true)
    expect(upperSidingBottom - lowerSidingTop).toBeCloseTo(3 / 8)
    expect(flashingPurchase).toEqual(
      expect.objectContaining({ purchaseLengthIn: 120, unit: '10-foot piece' }),
    )
  })

  it('covers siding corners with eight cut-to-height trim boards', () => {
    const building = generateBuilding(referenceDesign)
    const trim = building.members.filter((member) => member.id.startsWith('corner-trim-'))
    const trimPurchase = building.shoppingList.find(
      (item) => item.materialId === 'exterior-1x4-trim',
    )

    expect(trim).toHaveLength(8)
    expect(trim.every((member) => member.layer === 'finish')).toBe(true)
    expect(trim.every((member) => member.cutLengthIn === 102 + 27 / 32)).toBe(true)
    expect(trimPurchase).toEqual(expect.objectContaining({ count: 8, purchaseLengthIn: 120 }))
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

  it('adds framing behind horizontal wall and roof panel joints', () => {
    const tall = cloneProject(referenceDesign)
    tall.dimensions.wallHeightIn = 120
    const building = generateBuilding(tall)
    const wallBlocking = building.members.filter((member) =>
      member.id.startsWith('wall-panel-blocking-'),
    )
    const roofBlocking = building.members.filter((member) =>
      member.id.startsWith('roof-panel-blocking-'),
    )

    expect(wallBlocking.length).toBeGreaterThan(0)
    expect(new Set(wallBlocking.map((member) => member.position[1])).size).toBe(1)
    expect(roofBlocking.length).toBeGreaterThan(0)
    expect(roofBlocking.every((member) => member.cutLengthIn && member.cutLengthIn > 0)).toBe(true)
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
