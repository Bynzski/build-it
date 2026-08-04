import type { BuildItProject, Opening, WallId } from '../model/project'
import type {
  AssemblyId,
  ConstructionMember,
  GeneratedBuilding,
  MemberLayer,
  SurfaceQuantity,
  Vector3Tuple,
} from './construction'
import { estimateMaterials } from './estimate'
import { getGuidance } from './guidance'
import { getMaterial, type MaterialId } from './materials'

interface WallDefinition {
  id: WallId
  orientation: 'x' | 'z'
  spanIn: number
  surfaceSpanIn: number
  fixedIn: number
  outward: 1 | -1
}

interface GeneratorContext {
  project: BuildItProject
  members: ConstructionMember[]
  surfaces: SurfaceQuantity[]
  sequence: number
}

interface AddMemberOptions {
  label: string
  assembly: AssemblyId
  layer: MemberLayer
  materialId: MaterialId
  size: Vector3Tuple
  position: Vector3Tuple
  rotation?: Vector3Tuple
  cutLengthIn?: number
  idHint?: string
  shape?: 'box' | 'gable'
}

const SUBFLOOR_THICKNESS = 23 / 32
const WALL_SHEATHING_THICKNESS = 7 / 16
const SIDING_THICKNESS = 5 / 8
const ROOFING_THICKNESS = 1 / 8
const PLATE_THICKNESS = 1.5

function addMember(context: GeneratorContext, options: AddMemberOptions): void {
  context.sequence += 1
  context.members.push({
    id: `${options.idHint ?? options.assembly}-${context.sequence.toString().padStart(4, '0')}`,
    label: options.label,
    assembly: options.assembly,
    layer: options.layer,
    materialId: options.materialId,
    size: options.size,
    position: options.position,
    rotation: options.rotation,
    cutLengthIn: options.cutLengthIn,
    shape: options.shape,
  })
}

function memberPositions(spanIn: number, spacingIn: number): number[] {
  const positions = [-spanIn / 2]
  for (
    let position = -spanIn / 2 + spacingIn;
    position < spanIn / 2 - 0.01;
    position += spacingIn
  ) {
    positions.push(position)
  }
  const lastPosition = positions.at(-1) ?? -spanIn / 2
  if (Math.abs(lastPosition - spanIn / 2) > 0.01) positions.push(spanIn / 2)
  return positions
}

function memberCenterPositions(spanIn: number, spacingIn: number, memberWidthIn = 1.5): number[] {
  return memberPositions(Math.max(spanIn - memberWidthIn, 0), spacingIn)
}

function centeredMemberPositions(spanIn: number, spacingIn: number, memberWidthIn = 1.5): number[] {
  const positions = new Set(memberCenterPositions(spanIn, spacingIn, memberWidthIn))
  positions.add(0)
  return [...positions].sort((a, b) => a - b)
}

function lumberDimensions(materialId: MaterialId): [number, number] {
  const material = getMaterial(materialId)
  return [material.actualWidthIn ?? 1.5, material.actualDepthIn ?? 3.5]
}

function wallVector(
  wall: WallDefinition,
  along: number,
  vertical: number,
  fixedOffset = 0,
): Vector3Tuple {
  return wall.orientation === 'x'
    ? [along, vertical, wall.fixedIn + fixedOffset]
    : [wall.fixedIn + fixedOffset, vertical, along]
}

function wallMemberSize(
  wall: WallDefinition,
  along: number,
  vertical: number,
  depth: number,
): Vector3Tuple {
  return wall.orientation === 'x' ? [along, vertical, depth] : [depth, vertical, along]
}

function addFloor(context: GeneratorContext): { wallBaseIn: number; floorAreaSqIn: number } {
  const { project } = context
  const { widthIn, lengthIn } = project.dimensions
  const skidMaterial: MaterialId = 'pt-4x6'
  const [skidWidth, skidDepth] = lumberDimensions(skidMaterial)
  const skidCount = project.foundation.skidCount

  for (let index = 0; index < skidCount; index += 1) {
    const ratio = skidCount === 1 ? 0 : index / (skidCount - 1)
    const x = -widthIn * 0.32 + ratio * widthIn * 0.64
    addMember(context, {
      label: `Foundation skid ${index + 1}`,
      assembly: 'foundation',
      layer: 'framing',
      materialId: skidMaterial,
      size: [skidWidth, skidDepth, lengthIn],
      position: [x, skidDepth / 2, 0],
      cutLengthIn: lengthIn,
      idHint: 'skid',
    })
  }

  const joistMaterial = project.floor.joistSize as MaterialId
  const [joistWidth, joistDepth] = lumberDimensions(joistMaterial)
  const joistCenterY = skidDepth + joistDepth / 2

  addMember(context, {
    label: 'Front rim board',
    assembly: 'floor',
    layer: 'framing',
    materialId: joistMaterial,
    size: [widthIn, joistDepth, joistWidth],
    position: [0, joistCenterY, lengthIn / 2 - joistWidth / 2],
    cutLengthIn: widthIn,
    idHint: 'floor-rim',
  })
  addMember(context, {
    label: 'Back rim board',
    assembly: 'floor',
    layer: 'framing',
    materialId: joistMaterial,
    size: [widthIn, joistDepth, joistWidth],
    position: [0, joistCenterY, -lengthIn / 2 + joistWidth / 2],
    cutLengthIn: widthIn,
    idHint: 'floor-rim',
  })

  for (const z of memberPositions(lengthIn - joistWidth * 2, project.floor.spacingIn)) {
    addMember(context, {
      label: 'Floor joist',
      assembly: 'floor',
      layer: 'framing',
      materialId: joistMaterial,
      size: [widthIn - joistWidth * 2, joistDepth, joistWidth],
      position: [0, joistCenterY, z],
      cutLengthIn: widthIn - joistWidth * 2,
      idHint: 'floor-joist',
    })
  }

  const subfloorY = skidDepth + joistDepth + SUBFLOOR_THICKNESS / 2
  addMember(context, {
    label: 'Subfloor deck',
    assembly: 'floor',
    layer: 'sheathing',
    materialId: project.floor.sheathingMaterialId,
    size: [widthIn, SUBFLOOR_THICKNESS, lengthIn],
    position: [0, subfloorY, 0],
    idHint: 'subfloor',
  })

  const floorAreaSqIn = widthIn * lengthIn
  context.surfaces.push({
    id: 'subfloor-area',
    label: 'Subfloor area',
    assembly: 'floor',
    materialId: project.floor.sheathingMaterialId,
    areaSqIn: floorAreaSqIn,
  })

  return {
    wallBaseIn: skidDepth + joistDepth + SUBFLOOR_THICKNESS,
    floorAreaSqIn,
  }
}

function openingOnWall(project: BuildItProject, wallId: WallId): Opening[] {
  return project.openings
    .filter((opening) => opening.wall === wallId)
    .sort((a, b) => a.centerOffsetIn - b.centerOffsetIn)
}

function positionInsideOpening(position: number, openings: Opening[]): boolean {
  return openings.some(
    (opening) =>
      position > opening.centerOffsetIn - opening.widthIn / 2 - 2 &&
      position < opening.centerOffsetIn + opening.widthIn / 2 + 2,
  )
}

function addVerticalWallMember(
  context: GeneratorContext,
  wall: WallDefinition,
  materialId: MaterialId,
  depth: number,
  along: number,
  baseY: number,
  length: number,
  label: string,
  idHint: string,
  fixedOffset = 0,
): void {
  if (length <= 0.5) return
  addMember(context, {
    label,
    assembly: 'walls',
    layer: 'framing',
    materialId,
    size: wallMemberSize(wall, 1.5, length, depth),
    position: wallVector(wall, along, baseY + length / 2, fixedOffset),
    cutLengthIn: length,
    idHint,
  })
}

function addHorizontalWallMember(
  context: GeneratorContext,
  wall: WallDefinition,
  materialId: MaterialId,
  depth: number,
  alongCenter: number,
  centerY: number,
  length: number,
  memberHeight: number,
  label: string,
  idHint: string,
  fixedOffset = 0,
): void {
  if (length <= 0.5) return
  addMember(context, {
    label,
    assembly: 'walls',
    layer: 'framing',
    materialId,
    size: wallMemberSize(wall, length, memberHeight, depth),
    position: wallVector(wall, alongCenter, centerY, fixedOffset),
    cutLengthIn: length,
    idHint,
  })
}

function addOpeningFraming(
  context: GeneratorContext,
  wall: WallDefinition,
  opening: Opening,
  wallBaseIn: number,
  wallHeightIn: number,
  studMaterial: MaterialId,
  studDepth: number,
  studSpacingIn: number,
): void {
  const left = opening.centerOffsetIn - opening.widthIn / 2
  const right = opening.centerOffsetIn + opening.widthIn / 2
  const fullStudLength = wallHeightIn - PLATE_THICKNESS * 3
  const studBase = wallBaseIn + PLATE_THICKNESS
  const headerMaterial: MaterialId = studMaterial === '2x6' ? '2x8' : '2x6'
  const [, headerDepth] = lumberDimensions(headerMaterial)
  const headerBottom = wallBaseIn + opening.sillHeightIn + opening.heightIn
  const headerLength = opening.widthIn + 6

  for (const side of [-1, 1] as const) {
    const edge = side === -1 ? left : right
    addVerticalWallMember(
      context,
      wall,
      studMaterial,
      studDepth,
      edge + side * 2.25,
      studBase,
      fullStudLength,
      `${opening.type} king stud`,
      'king-stud',
    )
    const jackLength = headerBottom - studBase
    addVerticalWallMember(
      context,
      wall,
      studMaterial,
      studDepth,
      edge + side * 0.75,
      studBase,
      jackLength,
      `${opening.type} jack stud`,
      'jack-stud',
    )
  }

  for (const offset of [-0.8, 0.8]) {
    addHorizontalWallMember(
      context,
      wall,
      headerMaterial,
      1.5,
      opening.centerOffsetIn,
      headerBottom + headerDepth / 2,
      headerLength,
      headerDepth,
      `${opening.type} header`,
      'header',
      offset,
    )
  }

  if (opening.type === 'window') {
    addHorizontalWallMember(
      context,
      wall,
      studMaterial,
      studDepth,
      opening.centerOffsetIn,
      wallBaseIn + opening.sillHeightIn - PLATE_THICKNESS / 2,
      opening.widthIn + 3,
      PLATE_THICKNESS,
      'Window sill',
      'window-sill',
    )

    const crippleBase = studBase
    const crippleLength = opening.sillHeightIn - PLATE_THICKNESS * 2
    for (const position of memberPositions(opening.widthIn - 3, studSpacingIn)) {
      addVerticalWallMember(
        context,
        wall,
        studMaterial,
        studDepth,
        opening.centerOffsetIn + position,
        crippleBase,
        crippleLength,
        'Window lower cripple',
        'cripple-stud',
      )
    }
  }

  const upperCrippleBase = headerBottom + headerDepth
  const upperCrippleLength = wallBaseIn + wallHeightIn - PLATE_THICKNESS * 2 - upperCrippleBase
  for (const position of memberPositions(Math.max(opening.widthIn - 3, 1), studSpacingIn)) {
    addVerticalWallMember(
      context,
      wall,
      studMaterial,
      studDepth,
      opening.centerOffsetIn + position,
      upperCrippleBase,
      upperCrippleLength,
      `${opening.type} upper cripple`,
      'cripple-stud',
    )
  }
}

interface SurfaceCell {
  alongCenter: number
  verticalCenter: number
  width: number
  height: number
}

function wallSurfaceCells(spanIn: number, heightIn: number, openings: Opening[]): SurfaceCell[] {
  const alongBounds = new Set<number>([-spanIn / 2, spanIn / 2])
  const verticalBounds = new Set<number>([0, heightIn])
  for (const opening of openings) {
    alongBounds.add(Math.max(-spanIn / 2, opening.centerOffsetIn - opening.widthIn / 2))
    alongBounds.add(Math.min(spanIn / 2, opening.centerOffsetIn + opening.widthIn / 2))
    verticalBounds.add(Math.max(0, opening.sillHeightIn))
    verticalBounds.add(Math.min(heightIn, opening.sillHeightIn + opening.heightIn))
  }
  const along = [...alongBounds].sort((a, b) => a - b)
  const vertical = [...verticalBounds].sort((a, b) => a - b)
  const cells: SurfaceCell[] = []

  for (let xIndex = 0; xIndex < along.length - 1; xIndex += 1) {
    for (let yIndex = 0; yIndex < vertical.length - 1; yIndex += 1) {
      const start = along[xIndex]
      const end = along[xIndex + 1]
      const bottom = vertical[yIndex]
      const top = vertical[yIndex + 1]
      const centerAlong = (start + end) / 2
      const centerVertical = (bottom + top) / 2
      const insideOpening = openings.some(
        (opening) =>
          centerAlong > opening.centerOffsetIn - opening.widthIn / 2 &&
          centerAlong < opening.centerOffsetIn + opening.widthIn / 2 &&
          centerVertical > opening.sillHeightIn &&
          centerVertical < opening.sillHeightIn + opening.heightIn,
      )
      if (!insideOpening && end - start > 0.25 && top - bottom > 0.25) {
        cells.push({
          alongCenter: centerAlong,
          verticalCenter: centerVertical,
          width: end - start,
          height: top - bottom,
        })
      }
    }
  }
  return cells
}

function addWallSurfaceLayer(
  context: GeneratorContext,
  wall: WallDefinition,
  cells: SurfaceCell[],
  wallBaseIn: number,
  studDepth: number,
  materialId: MaterialId,
  thickness: number,
  layer: 'sheathing' | 'finish',
  distanceFromFraming: number,
  label: string,
): void {
  for (const cell of cells) {
    const fixedOffset = wall.outward * (studDepth / 2 + distanceFromFraming + thickness / 2)
    addMember(context, {
      label,
      assembly: 'walls',
      layer,
      materialId,
      size: wallMemberSize(wall, cell.width, cell.height, thickness),
      position: wallVector(wall, cell.alongCenter, wallBaseIn + cell.verticalCenter, fixedOffset),
      idHint: layer === 'finish' ? 'siding' : 'wall-sheathing',
    })
  }
}

function addWall(context: GeneratorContext, wall: WallDefinition, wallBaseIn: number): number {
  const { project } = context
  const height = project.dimensions.wallHeightIn
  const studMaterial = project.walls.studSize as MaterialId
  const [, studDepth] = lumberDimensions(studMaterial)
  const openings = openingOnWall(project, wall.id)
  const studLength = height - PLATE_THICKNESS * 3
  const studBase = wallBaseIn + PLATE_THICKNESS

  for (const position of memberCenterPositions(wall.spanIn, project.walls.spacingIn)) {
    if (positionInsideOpening(position, openings)) continue
    addVerticalWallMember(
      context,
      wall,
      studMaterial,
      studDepth,
      position,
      studBase,
      studLength,
      `${wall.id} wall stud`,
      'wall-stud',
    )
  }

  addHorizontalWallMember(
    context,
    wall,
    studMaterial,
    studDepth,
    0,
    wallBaseIn + PLATE_THICKNESS / 2,
    wall.spanIn,
    PLATE_THICKNESS,
    `${wall.id} bottom plate`,
    'bottom-plate',
  )
  for (let plate = 0; plate < 2; plate += 1) {
    addHorizontalWallMember(
      context,
      wall,
      studMaterial,
      studDepth,
      0,
      wallBaseIn + height - PLATE_THICKNESS / 2 - plate * PLATE_THICKNESS,
      wall.spanIn,
      PLATE_THICKNESS,
      `${wall.id} top plate`,
      'top-plate',
    )
  }

  for (const opening of openings) {
    addOpeningFraming(
      context,
      wall,
      opening,
      wallBaseIn,
      height,
      studMaterial,
      studDepth,
      project.walls.spacingIn,
    )
  }

  const openingArea = openings.reduce(
    (total, opening) => total + opening.widthIn * opening.heightIn,
    0,
  )
  const netArea = Math.max(0, wall.surfaceSpanIn * height - openingArea)
  const sheathingSpan = wall.surfaceSpanIn + WALL_SHEATHING_THICKNESS * 2
  const sidingSpan = wall.surfaceSpanIn + (WALL_SHEATHING_THICKNESS + SIDING_THICKNESS) * 2
  const sheathingCells = wallSurfaceCells(sheathingSpan, height, openings)
  const sidingCells = wallSurfaceCells(sidingSpan, height, openings)

  addWallSurfaceLayer(
    context,
    wall,
    sheathingCells,
    wallBaseIn,
    studDepth,
    project.walls.sheathingMaterialId,
    WALL_SHEATHING_THICKNESS,
    'sheathing',
    0,
    `${wall.id} wall sheathing`,
  )
  addWallSurfaceLayer(
    context,
    wall,
    sidingCells,
    wallBaseIn,
    studDepth,
    project.walls.sidingMaterialId,
    SIDING_THICKNESS,
    'finish',
    WALL_SHEATHING_THICKNESS,
    `${wall.id} wall siding`,
  )

  context.surfaces.push(
    {
      id: `${wall.id}-sheathing-area`,
      label: `${wall.id} wall sheathing`,
      assembly: 'walls',
      materialId: project.walls.sheathingMaterialId,
      areaSqIn: Math.max(0, sheathingSpan * height - openingArea),
    },
    {
      id: `${wall.id}-siding-area`,
      label: `${wall.id} wall siding`,
      assembly: 'walls',
      materialId: project.walls.sidingMaterialId,
      areaSqIn: Math.max(0, sidingSpan * height - openingArea),
    },
  )
  if (project.walls.insulationMaterialId) {
    context.surfaces.push({
      id: `${wall.id}-insulation-area`,
      label: `${wall.id} wall insulation`,
      assembly: 'walls',
      materialId: project.walls.insulationMaterialId,
      areaSqIn: netArea,
    })
  }
  if (project.walls.interiorMaterialId) {
    context.surfaces.push({
      id: `${wall.id}-interior-area`,
      label: `${wall.id} interior finish`,
      assembly: 'walls',
      materialId: project.walls.interiorMaterialId,
      areaSqIn: netArea,
    })
  }
  return netArea
}

function addGableEndFraming(context: GeneratorContext, wallBaseIn: number, riseIn: number): number {
  const { project } = context
  const { widthIn, lengthIn, wallHeightIn } = project.dimensions
  const studMaterial = project.walls.studSize as MaterialId
  const [, studDepth] = lumberDimensions(studMaterial)
  const baseY = wallBaseIn + wallHeightIn
  const gableAreaSqIn = widthIn * riseIn
  const framingPlane = lengthIn / 2 - studDepth / 2

  for (const wall of [
    { id: 'front' as const, fixedIn: framingPlane, outward: 1 as const },
    { id: 'back' as const, fixedIn: -framingPlane, outward: -1 as const },
  ]) {
    const definition: WallDefinition = {
      id: wall.id,
      orientation: 'x',
      spanIn: widthIn,
      surfaceSpanIn: widthIn,
      fixedIn: wall.fixedIn,
      outward: wall.outward,
    }
    for (const x of centeredMemberPositions(widthIn, project.walls.spacingIn).slice(1, -1)) {
      const height = riseIn * (1 - Math.abs(x) / (widthIn / 2))
      addVerticalWallMember(
        context,
        definition,
        studMaterial,
        studDepth,
        x,
        baseY,
        Math.max(0, height - 1.5),
        `${wall.id} gable stud`,
        'gable-stud',
      )
    }

    addMember(context, {
      label: `${wall.id} gable sheathing`,
      assembly: 'walls',
      layer: 'sheathing',
      materialId: project.walls.sheathingMaterialId,
      size: [widthIn + WALL_SHEATHING_THICKNESS * 2, riseIn, WALL_SHEATHING_THICKNESS],
      position: [
        0,
        baseY + riseIn / 2,
        wall.fixedIn + wall.outward * (studDepth / 2 + WALL_SHEATHING_THICKNESS / 2),
      ],
      idHint: 'gable-sheathing',
      shape: 'gable',
    })
    addMember(context, {
      label: `${wall.id} gable siding`,
      assembly: 'walls',
      layer: 'finish',
      materialId: project.walls.sidingMaterialId,
      size: [widthIn + (WALL_SHEATHING_THICKNESS + SIDING_THICKNESS) * 2, riseIn, SIDING_THICKNESS],
      position: [
        0,
        baseY + riseIn / 2,
        wall.fixedIn +
          wall.outward * (studDepth / 2 + WALL_SHEATHING_THICKNESS + SIDING_THICKNESS / 2),
      ],
      idHint: 'gable-siding',
      shape: 'gable',
    })
  }

  context.surfaces.push(
    {
      id: 'gable-sheathing-area',
      label: 'Gable end sheathing',
      assembly: 'walls',
      materialId: project.walls.sheathingMaterialId,
      areaSqIn: gableAreaSqIn,
    },
    {
      id: 'gable-siding-area',
      label: 'Gable end siding',
      assembly: 'walls',
      materialId: project.walls.sidingMaterialId,
      areaSqIn: gableAreaSqIn,
    },
  )
  if (project.walls.insulationMaterialId) {
    context.surfaces.push({
      id: 'gable-insulation-area',
      label: 'Gable end insulation',
      assembly: 'walls',
      materialId: project.walls.insulationMaterialId,
      areaSqIn: gableAreaSqIn,
    })
  }
  if (project.walls.interiorMaterialId) {
    context.surfaces.push({
      id: 'gable-interior-area',
      label: 'Gable end interior finish',
      assembly: 'walls',
      materialId: project.walls.interiorMaterialId,
      areaSqIn: gableAreaSqIn,
    })
  }
  return gableAreaSqIn
}

function addRoof(
  context: GeneratorContext,
  wallBaseIn: number,
): { roofAreaSqIn: number; peakHeightIn: number; gableAreaSqIn: number } {
  const { project } = context
  const { widthIn, lengthIn, wallHeightIn } = project.dimensions
  const overhang = project.roof.overhangIn
  const pitch = project.roof.pitchRise / 12
  const run = widthIn / 2
  const extendedRun = run + overhang
  const rise = run * pitch
  const extendedRise = extendedRun * pitch
  const rafterLength = Math.hypot(extendedRun, extendedRise)
  const roofLength = lengthIn + overhang * 2
  const roofBase = wallBaseIn + wallHeightIn
  const peakY = roofBase + rise
  const eaveY = peakY - extendedRise
  const angle = Math.atan(pitch)
  const rafterMaterial = project.roof.rafterSize as MaterialId
  const [rafterThickness, rafterDepth] = lumberDimensions(rafterMaterial)

  const gableAreaSqIn = addGableEndFraming(context, wallBaseIn, rise)
  const structuralRafterPositions = memberCenterPositions(
    lengthIn,
    project.roof.spacingIn,
    rafterThickness,
  )

  for (const z of structuralRafterPositions) {
    const atGable = Math.abs(Math.abs(z) - (lengthIn - rafterThickness) / 2) < 0.01
    for (const side of [-1, 1] as const) {
      addMember(context, {
        label: `${atGable ? (z > 0 ? 'Front gable' : 'Back gable') : side === -1 ? 'Left' : 'Right'} rafter`,
        assembly: 'roof',
        layer: 'framing',
        materialId: rafterMaterial,
        size: [rafterLength, rafterDepth, rafterThickness],
        position: [(side * extendedRun) / 2, (eaveY + peakY) / 2, z],
        rotation: [0, 0, side === -1 ? angle : -angle],
        cutLengthIn: rafterLength,
        idHint: 'rafter',
      })
    }
  }

  if (overhang > 0) {
    const flyRafterOffset = roofLength / 2 - rafterThickness / 2
    const lookoutLength = overhang + rafterThickness
    const lookoutNormalOffset = rafterDepth / 2 - PLATE_THICKNESS / 2
    const lookoutRuns = [extendedRun * 0.2, extendedRun * 0.52, extendedRun * 0.84]

    for (const end of [-1, 1] as const) {
      for (const side of [-1, 1] as const) {
        const rotationZ = side === -1 ? angle : -angle
        addMember(context, {
          label: `${end === 1 ? 'Front' : 'Back'} ${side === -1 ? 'left' : 'right'} fly rafter`,
          assembly: 'roof',
          layer: 'framing',
          materialId: rafterMaterial,
          size: [rafterLength, rafterDepth, rafterThickness],
          position: [(side * extendedRun) / 2, (eaveY + peakY) / 2, end * flyRafterOffset],
          rotation: [0, 0, rotationZ],
          cutLengthIn: rafterLength,
          idHint: 'fly-rafter',
        })

        for (const lookoutRun of lookoutRuns) {
          const centerlineX = side * lookoutRun
          const centerlineY = peakY - lookoutRun * pitch
          addMember(context, {
            label: `${end === 1 ? 'Front' : 'Back'} rake lookout`,
            assembly: 'roof',
            layer: 'framing',
            materialId: '2x4',
            size: [3.5, PLATE_THICKNESS, lookoutLength],
            position: [
              centerlineX + side * Math.sin(angle) * lookoutNormalOffset,
              centerlineY + Math.cos(angle) * lookoutNormalOffset,
              end * (lengthIn / 2 + overhang / 2 - rafterThickness / 2),
            ],
            rotation: [0, 0, rotationZ],
            cutLengthIn: lookoutLength,
            idHint: 'rake-lookout',
          })
        }
      }
    }
  }

  addMember(context, {
    label: 'Roof ridge board',
    assembly: 'roof',
    layer: 'framing',
    materialId: '2x8',
    size: [1.5, 7.25, roofLength],
    position: [0, peakY - 2, 0],
    cutLengthIn: roofLength,
    idHint: 'ridge-board',
  })

  for (const side of [-1, 1] as const) {
    const rotationZ = side === -1 ? angle : -angle
    const sheathingOffset = rafterDepth / 2 + WALL_SHEATHING_THICKNESS / 2
    const roofingOffset = rafterDepth / 2 + WALL_SHEATHING_THICKNESS + ROOFING_THICKNESS / 2
    addMember(context, {
      label: `${side === -1 ? 'Left' : 'right'} roof sheathing`,
      assembly: 'roof',
      layer: 'sheathing',
      materialId: project.roof.sheathingMaterialId,
      size: [rafterLength, WALL_SHEATHING_THICKNESS, roofLength],
      position: [
        (side * extendedRun) / 2 + side * Math.sin(angle) * sheathingOffset,
        (eaveY + peakY) / 2 + Math.cos(angle) * sheathingOffset,
        0,
      ],
      rotation: [0, 0, rotationZ],
      idHint: 'roof-sheathing',
    })
    addMember(context, {
      label: `${side === -1 ? 'Left' : 'right'} roofing`,
      assembly: 'roof',
      layer: 'finish',
      materialId: project.roof.roofingMaterialId,
      size: [rafterLength, ROOFING_THICKNESS, roofLength],
      position: [
        (side * extendedRun) / 2 + side * Math.sin(angle) * roofingOffset,
        (eaveY + peakY) / 2 + Math.cos(angle) * roofingOffset,
        0,
      ],
      rotation: [0, 0, rotationZ],
      idHint: 'roofing',
    })
  }

  const roofAreaSqIn = 2 * rafterLength * roofLength
  context.surfaces.push(
    {
      id: 'roof-sheathing-area',
      label: 'Roof sheathing area',
      assembly: 'roof',
      materialId: project.roof.sheathingMaterialId,
      areaSqIn: roofAreaSqIn,
    },
    {
      id: 'roofing-area',
      label: 'Roofing area',
      assembly: 'roof',
      materialId: project.roof.roofingMaterialId,
      areaSqIn: roofAreaSqIn,
    },
  )

  return { roofAreaSqIn, peakHeightIn: peakY, gableAreaSqIn }
}

export function generateBuilding(project: BuildItProject): GeneratedBuilding {
  const context: GeneratorContext = {
    project,
    members: [],
    surfaces: [],
    sequence: 0,
  }
  const { widthIn, lengthIn } = project.dimensions
  const { wallBaseIn, floorAreaSqIn } = addFloor(context)
  const [, studDepth] = lumberDimensions(project.walls.studSize as MaterialId)
  const frontBackPlane = lengthIn / 2 - studDepth / 2
  const sidePlane = widthIn / 2 - studDepth / 2
  const walls: WallDefinition[] = [
    {
      id: 'front',
      orientation: 'x',
      spanIn: widthIn,
      surfaceSpanIn: widthIn,
      fixedIn: frontBackPlane,
      outward: 1,
    },
    {
      id: 'back',
      orientation: 'x',
      spanIn: widthIn,
      surfaceSpanIn: widthIn,
      fixedIn: -frontBackPlane,
      outward: -1,
    },
    {
      id: 'left',
      orientation: 'z',
      spanIn: lengthIn - studDepth * 2,
      surfaceSpanIn: lengthIn,
      fixedIn: -sidePlane,
      outward: -1,
    },
    {
      id: 'right',
      orientation: 'z',
      spanIn: lengthIn - studDepth * 2,
      surfaceSpanIn: lengthIn,
      fixedIn: sidePlane,
      outward: 1,
    },
  ]
  let wallAreaSqIn = walls.reduce((area, wall) => area + addWall(context, wall, wallBaseIn), 0)
  const { roofAreaSqIn, peakHeightIn, gableAreaSqIn } = addRoof(context, wallBaseIn)
  wallAreaSqIn += gableAreaSqIn
  const estimate = estimateMaterials(context.members, context.surfaces, project.wasteFactorPct)

  return {
    members: context.members,
    surfaces: context.surfaces,
    shoppingList: estimate.shoppingList,
    breakdown: estimate.breakdown,
    guidance: getGuidance(project),
    metrics: {
      footprintSqFt: floorAreaSqIn / 144,
      wallAreaSqFt: wallAreaSqIn / 144,
      roofAreaSqFt: roofAreaSqIn / 144,
      peakHeightIn,
      framingMemberCount: context.members.filter((member) => member.layer === 'framing').length,
    },
  }
}
