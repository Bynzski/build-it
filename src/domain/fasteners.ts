import type { BuildItProject } from '../model/project'
import type { ConstructionMember, ConsumableQuantity, SurfaceQuantity } from './construction'
import { getRoofCladdingInstallation } from './materials'

const PLANNING_OVERAGE_PCT = 10

function startsWithAny(member: ConstructionMember, prefixes: string[]): boolean {
  return prefixes.some((prefix) => member.id.startsWith(`${prefix}-`))
}

function linearFastenerCount(lengthIn: number, spacingIn: number): number {
  return Math.max(2, Math.ceil(lengthIn / spacingIn) + 1)
}

function polygonPerimeter(points: [number, number][]): number {
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length]
    return total + Math.hypot(next[0] - point[0], next[1] - point[1])
  }, 0)
}

function panelPlaneDimensions(member: ConstructionMember): [number, number] {
  if (member.assembly === 'walls') return [member.size[1], Math.max(member.size[0], member.size[2])]
  return [member.size[0], member.size[2]]
}

function panelFastenerCount(
  member: ConstructionMember,
  supportSpacingIn: number,
  edgeSpacingIn = 6,
  fieldSpacingIn = 12,
): number {
  const [alongSupportIn, acrossSupportsIn] = panelPlaneDimensions(member)
  let edgeCount: number

  if (member.profileRegions && member.profileRegions.length > 0) {
    const edgeLength = member.profileRegions.reduce(
      (total, region) =>
        total +
        polygonPerimeter(region.outline) +
        region.holes.reduce((holeTotal, hole) => holeTotal + polygonPerimeter(hole), 0),
      0,
    )
    edgeCount = Math.ceil(edgeLength / edgeSpacingIn)
  } else if (member.profile && member.profile.length > 0) {
    edgeCount = Math.ceil(polygonPerimeter(member.profile) / edgeSpacingIn)
  } else {
    edgeCount =
      2 * linearFastenerCount(alongSupportIn, edgeSpacingIn) +
      2 * linearFastenerCount(acrossSupportsIn, edgeSpacingIn) -
      4
  }

  const interiorSupportLines = Math.max(0, Math.ceil(acrossSupportsIn / supportSpacingIn) - 1)
  const fieldCount = interiorSupportLines * linearFastenerCount(alongSupportIn, fieldSpacingIn)
  return edgeCount + fieldCount
}

function addConsumable(
  quantities: ConsumableQuantity[],
  options: Omit<ConsumableQuantity, 'requiredCount' | 'overagePct'> & {
    requiredCount: number
    overagePct?: number
  },
): void {
  if (options.requiredCount <= 0) return
  quantities.push({
    ...options,
    requiredCount: Math.ceil(options.requiredCount),
    overagePct: options.overagePct ?? PLANNING_OVERAGE_PCT,
  })
}

function addFloorFasteners(
  quantities: ConsumableQuantity[],
  project: BuildItProject,
  members: ConstructionMember[],
): void {
  const floorJoists = members.filter((member) => member.id.startsWith('floor-joist-'))
  const subfloorPanels = members.filter((member) => member.id.startsWith('subfloor-panel-'))

  addConsumable(quantities, {
    id: 'floor-joist-bearing-nails',
    label: 'Floor joist-to-skid toenails',
    assembly: 'floor',
    materialId: '8d-common-nails',
    requiredCount: floorJoists.length * project.foundation.skidCount * 3,
    note: 'Allows three 8d common toenails at each modeled joist-to-skid bearing.',
  })
  addConsumable(quantities, {
    id: 'floor-rim-nails',
    label: 'Floor rim-to-joist end nails',
    assembly: 'floor',
    materialId: '10d-common-nails',
    requiredCount: floorJoists.length * 6,
    note: 'Allows three 10d end nails through each rim board into each joist end.',
  })
  addConsumable(quantities, {
    id: 'subfloor-panel-nails',
    label: 'Subfloor panel nails',
    assembly: 'floor',
    materialId: '8d-subfloor-nails',
    requiredCount: subfloorPanels.reduce(
      (total, panel) => total + panelFastenerCount(panel, project.floor.spacingIn),
      0,
    ),
    note: 'Uses a planning pattern of 6 inches at supported edges and 12 inches in the field.',
  })
}

function addWallFasteners(
  quantities: ConsumableQuantity[],
  project: BuildItProject,
  members: ConstructionMember[],
  surfaces: SurfaceQuantity[],
): void {
  const verticalFramingPrefixes = [
    'wall-stud',
    'king-stud',
    'jack-stud',
    'cripple-stud',
    'gable-stud',
  ]
  const verticalFraming = members.filter((member) => startsWithAny(member, verticalFramingPrefixes))
  const bottomPlates = members.filter((member) => member.id.startsWith('bottom-plate-'))
  const topPlates = members.filter((member) => member.id.startsWith('top-plate-'))
  const horizontalFraming = members.filter((member) =>
    startsWithAny(member, [
      'header',
      'window-sill',
      'wall-panel-blocking',
      'gable-panel-blocking',
      'dropped-gable-top-plate',
    ]),
  )
  const headers = members.filter((member) => member.id.startsWith('header-'))
  const sheathingPanels = members.filter((member) =>
    startsWithAny(member, ['wall-sheathing', 'gable-sheathing']),
  )
  const sidingPanels = members.filter((member) => startsWithAny(member, ['siding', 'gable-siding']))
  const cornerTrim = members.filter((member) => member.id.startsWith('corner-trim-'))
  const flashing = members.filter((member) =>
    startsWithAny(member, ['z-flashing', 'opening-head-flashing', 'gable-z-flashing']),
  )

  const studAndPlateNails =
    verticalFraming.length * 4 +
    bottomPlates.reduce(
      (total, plate) => total + linearFastenerCount(plate.cutLengthIn ?? 0, 16),
      0,
    )
  addConsumable(quantities, {
    id: 'wall-stud-and-bottom-plate-nails',
    label: 'Wall stud and bottom-plate framing nails',
    assembly: 'walls',
    materialId: '16d-framing-nails',
    requiredCount: studAndPlateNails,
    note: 'Allows two 16d end nails at each modeled vertical-member end and bottom-plate attachment at 16 inches on center.',
  })

  const topPlateLaminateLength =
    topPlates.reduce((total, plate) => total + (plate.cutLengthIn ?? 0), 0) / 2
  const headerLaminateLength =
    headers.reduce((total, header) => total + (header.cutLengthIn ?? 0), 0) / 2
  const wallTenPennyCount =
    linearFastenerCount(topPlateLaminateLength, 24) +
    8 +
    horizontalFraming.length * 4 +
    linearFastenerCount(headerLaminateLength, 16) * 2
  addConsumable(quantities, {
    id: 'wall-plate-header-and-blocking-nails',
    label: 'Wall plate, header, sill, and blocking nails',
    assembly: 'walls',
    materialId: '10d-common-nails',
    requiredCount: wallTenPennyCount,
    note: 'Allows top-plate lamination at 24 inches on center, opening/header assembly, corner laps, and two nails at each blocking end.',
  })

  addConsumable(quantities, {
    id: 'wall-sheathing-nails',
    label: 'Wall and gable sheathing nails',
    assembly: 'walls',
    materialId: '8d-common-nails',
    requiredCount: sheathingPanels.reduce(
      (total, panel) => total + panelFastenerCount(panel, project.walls.spacingIn),
      0,
    ),
    note: 'Uses a planning pattern of 6 inches at supported panel edges and 12 inches at intermediate studs.',
  })
  addConsumable(quantities, {
    id: 'panel-siding-nails',
    label: 'Panel siding nails',
    assembly: 'walls',
    materialId: 'siding-panel-nails',
    requiredCount: sidingPanels.reduce(
      (total, panel) => total + panelFastenerCount(panel, project.walls.spacingIn),
      0,
    ),
    note: 'Uses corrosion-resistant ring-shank nails at 6 inches around panel perimeters and 12 inches in the field.',
  })

  const trimNails =
    cornerTrim.reduce(
      (total, trim) => total + 2 * linearFastenerCount(trim.cutLengthIn ?? 0, 16),
      0,
    ) +
    flashing.reduce((total, member) => total + linearFastenerCount(member.cutLengthIn ?? 0, 16), 0)
  addConsumable(quantities, {
    id: 'exterior-trim-and-flashing-nails',
    label: 'Exterior trim and flashing nails',
    assembly: 'walls',
    materialId: 'exterior-trim-nails',
    requiredCount: trimNails,
    note: 'Allows paired trim nails at 16 inches on center and a light concealed attachment allowance for flashing.',
  })

  const wallWrbAreaSqIn = surfaces
    .filter((surface) => surface.materialId === project.walls.weatherBarrierMaterialId)
    .reduce((total, surface) => total + surface.areaSqIn, 0)
  addConsumable(quantities, {
    id: 'wall-wrb-cap-fasteners',
    label: 'Wall WRB cap fasteners',
    assembly: 'walls',
    materialId: 'cap-fasteners',
    requiredCount: wallWrbAreaSqIn / (project.walls.spacingIn * 18),
    note: 'Approximates cap fasteners on stud lines at 18 inches vertically; opening exclusion zones and seam details require field adjustment.',
  })

  if (project.walls.interiorMaterialId === 'drywall-1-2') {
    const drywallAreaSqFt =
      surfaces
        .filter((surface) => surface.materialId === 'drywall-1-2')
        .reduce((total, surface) => total + surface.areaSqIn, 0) / 144
    addConsumable(quantities, {
      id: 'interior-drywall-screws',
      label: 'Interior drywall screws',
      assembly: 'walls',
      materialId: 'drywall-screws-1-1-4',
      requiredCount: drywallAreaSqFt,
      note: 'Allows approximately 32 screws per 4×8 sheet; ceilings and rated assemblies need their own schedule.',
    })
  }
}

function addRoofFasteners(
  quantities: ConsumableQuantity[],
  project: BuildItProject,
  members: ConstructionMember[],
  surfaces: SurfaceQuantity[],
): void {
  const commonRafters = members.filter(
    (member) => member.id.startsWith('rafter-') && !member.id.startsWith('rafter-tie-'),
  )
  const rafterTies = members.filter((member) => member.id.startsWith('rafter-tie-'))
  const flyRafters = members.filter((member) => member.id.startsWith('fly-rafter-'))
  const lookouts = members.filter((member) => member.id.startsWith('rake-lookout-'))
  const roofBlocking = members.filter((member) => member.id.startsWith('roof-panel-blocking-'))
  const ridgeStraps = members.filter((member) => member.id.startsWith('ridge-strap-'))
  const roofSheathing = members.filter((member) => member.id.startsWith('roof-sheathing-panel-'))
  const roofPanels = members.filter((member) => member.id.startsWith('metal-roof-panel-'))
  const rakeTrim = members.filter((member) => member.id.startsWith('metal-rake-trim-'))
  const eaveTrim = members.filter((member) => member.id.startsWith('metal-eave-trim-'))
  const ridgeCap = members.find((member) => member.id.startsWith('metal-ridge-cap-'))

  addConsumable(quantities, {
    id: 'roof-framing-common-nails',
    label: 'Rafter, ridge, lookout, blocking, and ridge-strap nails',
    assembly: 'roof',
    materialId: '10d-common-nails',
    requiredCount:
      commonRafters.length * 6 +
      flyRafters.length * 3 +
      lookouts.length * 4 +
      roofBlocking.length * 4 +
      ridgeStraps.length * 6,
    note: 'Allows three 10d nails at common-rafter ridge and plate connections, two at each lookout/blocking end, and three per rafter side at each ridge strap.',
  })
  addConsumable(quantities, {
    id: 'rafter-tie-and-subfascia-nails',
    label: 'Rafter-tie and eave-subfascia nails',
    assembly: 'roof',
    materialId: '16d-framing-nails',
    requiredCount: rafterTies.length * 6 + (commonRafters.length + flyRafters.length) * 2,
    note: 'Rafter-tie allowance uses three 16d nails at each heel only as a small-reference planning baseline; required heel-joint nailing varies with span, pitch, spacing, and snow load.',
  })
  addConsumable(quantities, {
    id: 'roof-sheathing-nails',
    label: 'Roof sheathing nails',
    assembly: 'roof',
    materialId: '8d-common-nails',
    requiredCount: roofSheathing.reduce(
      (total, panel) => total + panelFastenerCount(panel, project.roof.spacingIn),
      0,
    ),
    note: 'Uses a planning pattern of 6 inches at supported panel edges and 12 inches at intermediate rafters.',
  })

  const roofAreaSqFt =
    (surfaces.find((surface) => surface.id === 'roofing-area')?.areaSqIn ?? 0) / 144
  const roofCladding = getRoofCladdingInstallation(project.roof.roofingMaterialId)
  addConsumable(quantities, {
    id: 'metal-roof-panel-screws',
    label: 'Metal roof panel screws',
    assembly: 'roof',
    materialId: 'metal-panel-screws',
    requiredCount: (roofAreaSqFt / 100) * roofCladding.panelFastenersPerSquare,
    note: `Uses the reference panel manufacturer's typical allowance of ${roofCladding.panelFastenersPerSquare} panel screws per roofing square; wind and substrate can require a different tested pattern.`,
  })

  const panelsPerSlope = roofPanels.length / 2
  const panelLength = roofPanels[0]?.cutLengthIn ?? 0
  const sideLapCount = Math.max(0, panelsPerSlope - 1) * 2
  const sideLapScrews =
    sideLapCount * linearFastenerCount(panelLength, roofCladding.sideLapFastenerSpacingIn)
  const ridgeScrews = ridgeCap
    ? linearFastenerCount(ridgeCap.cutLengthIn ?? 0, roofCladding.majorRibSpacingIn)
    : 0
  const rakeScrews = rakeTrim.reduce(
    (total, trim) =>
      total + linearFastenerCount(trim.cutLengthIn ?? 0, roofCladding.trimFastenerSpacingIn),
    0,
  )
  addConsumable(quantities, {
    id: 'metal-roof-stitch-screws',
    label: 'Metal roof sidelap, ridge, and rake stitch screws',
    assembly: 'roof',
    materialId: 'metal-stitch-screws',
    requiredCount: sideLapScrews + ridgeScrews + rakeScrews,
    note: 'Uses 12-inch sidelap/rake spacing and one ridge-cap stitch screw at each major rib for the reference panel.',
  })
  addConsumable(quantities, {
    id: 'metal-roof-trim-screws',
    label: 'Metal roof concealed trim screws',
    assembly: 'roof',
    materialId: 'metal-trim-screws',
    requiredCount: eaveTrim.reduce(
      (total, trim) =>
        total + linearFastenerCount(trim.cutLengthIn ?? 0, roofCladding.trimFastenerSpacingIn),
      0,
    ),
    note: 'Allows concealed low-profile attachment of the two eave trims at 12 inches on center.',
  })

  const roofUnderlaymentAreaSqIn =
    surfaces.find((surface) => surface.id === 'roof-underlayment-area')?.areaSqIn ?? 0
  addConsumable(quantities, {
    id: 'roof-underlayment-cap-fasteners',
    label: 'Roof underlayment cap fasteners',
    assembly: 'roof',
    materialId: 'cap-fasteners',
    requiredCount: roofUnderlaymentAreaSqIn / (16 * 16),
    note: 'Provides a temporary 16×16-inch cap-fastener planning grid; use the selected underlayment manufacturer’s pattern.',
  })
}

export function estimateFasteners(
  project: BuildItProject,
  members: ConstructionMember[],
  surfaces: SurfaceQuantity[],
): ConsumableQuantity[] {
  const quantities: ConsumableQuantity[] = []
  addFloorFasteners(quantities, project, members)
  addWallFasteners(quantities, project, members, surfaces)
  addRoofFasteners(quantities, project, members, surfaces)
  return quantities
}
