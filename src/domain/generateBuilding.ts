import type { BuildItProject, Opening, WallId } from '../model/project'
import type {
  AssemblyId,
  ConstructionMember,
  FabricationSpec,
  GeneratedBuilding,
  MemberLayer,
  ProfilePoint,
  SurfaceQuantity,
  Vector3Tuple,
} from './construction'
import { constructionRules, wallPanelLayoutSpan } from './constructionRules'
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
  shape?: 'box' | 'gable' | 'profile'
  profile?: ProfilePoint[]
  fabrication?: FabricationSpec
}

const SUBFLOOR_THICKNESS = constructionRules.layers.subfloorThicknessIn
const WALL_SHEATHING_THICKNESS = constructionRules.layers.wallSheathingThicknessIn
const SIDING_THICKNESS = constructionRules.layers.sidingThicknessIn
const ROOFING_THICKNESS = constructionRules.layers.roofingThicknessIn
const PLATE_THICKNESS = constructionRules.plateThicknessIn
const PANEL_SHORT_EDGE = constructionRules.panels.shortEdgeIn
const PANEL_LONG_EDGE = constructionRules.panels.longEdgeIn
const PANEL_GAP = constructionRules.panels.jointGapIn

interface PanelSegment {
  start: number
  end: number
}

function panelSegments(
  spanIn: number,
  maximumLengthIn: number,
  leadingLengthIn = 0,
): PanelSegment[] {
  const start = -spanIn / 2
  const end = spanIn / 2
  const segments: PanelSegment[] = []
  let cursor = start

  if (leadingLengthIn > 0) {
    const leadingEnd = Math.min(cursor + leadingLengthIn, end)
    if (leadingEnd - cursor > 0.01) segments.push({ start: cursor, end: leadingEnd })
    cursor = leadingEnd
  }

  while (cursor < end - 0.01) {
    const next = Math.min(cursor + maximumLengthIn, end)
    segments.push({ start: cursor, end: next })
    cursor = next
  }
  return segments
}

function insetPanelJoints(segments: PanelSegment[]): PanelSegment[] {
  return segments.map((segment, index) => ({
    start: segment.start + (index > 0 ? PANEL_GAP / 2 : 0),
    end: segment.end - (index < segments.length - 1 ? PANEL_GAP / 2 : 0),
  }))
}

function positivePanelSegments(
  spanIn: number,
  maximumLengthIn: number,
  leadingLengthIn = 0,
): PanelSegment[] {
  return panelSegments(spanIn, maximumLengthIn, leadingLengthIn).map((segment) => ({
    start: segment.start + spanIn / 2,
    end: segment.end + spanIn / 2,
  }))
}

function clipPolygon(
  points: ProfilePoint[],
  inside: (point: ProfilePoint) => boolean,
  intersection: (start: ProfilePoint, end: ProfilePoint) => ProfilePoint,
): ProfilePoint[] {
  if (points.length === 0) return []
  const clipped: ProfilePoint[] = []

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const startInside = inside(start)
    const endInside = inside(end)

    if (startInside && endInside) clipped.push(end)
    else if (startInside) clipped.push(intersection(start, end))
    else if (endInside) clipped.push(intersection(start, end), end)
  }
  return clipped
}

function clipPolygonToRectangle(
  points: ProfilePoint[],
  rectangle: Omit<PanelRectangle, 'panelIndex'>,
): ProfilePoint[] {
  const verticalIntersection = (x: number) => (start: ProfilePoint, end: ProfilePoint) => {
    const ratio = (x - start[0]) / (end[0] - start[0])
    return [x, start[1] + (end[1] - start[1]) * ratio] as ProfilePoint
  }
  const horizontalIntersection = (y: number) => (start: ProfilePoint, end: ProfilePoint) => {
    const ratio = (y - start[1]) / (end[1] - start[1])
    return [start[0] + (end[0] - start[0]) * ratio, y] as ProfilePoint
  }

  let clipped = clipPolygon(
    points,
    ([x]) => x >= rectangle.left,
    verticalIntersection(rectangle.left),
  )
  clipped = clipPolygon(
    clipped,
    ([x]) => x <= rectangle.right,
    verticalIntersection(rectangle.right),
  )
  clipped = clipPolygon(
    clipped,
    ([, y]) => y >= rectangle.bottom,
    horizontalIntersection(rectangle.bottom),
  )
  return clipPolygon(clipped, ([, y]) => y <= rectangle.top, horizontalIntersection(rectangle.top))
}

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
    profile: options.profile,
    fabrication: options.fabrication,
  })
}

function signedArea(points: ProfilePoint[]): number {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]
    return area + point[0] * next[1] - next[0] * point[1]
  }, 0)
}

function profileGeometry(
  worldPoints: ProfilePoint[],
  extrusionIn: number,
  fixedIn: number,
): Pick<AddMemberOptions, 'size' | 'position' | 'shape' | 'profile'> {
  const points = signedArea(worldPoints) < 0 ? [...worldPoints].reverse() : worldPoints
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return {
    size: [maxX - minX, maxY - minY, extrusionIn],
    position: [centerX, centerY, fixedIn],
    shape: 'profile',
    profile: points.map(([x, y]) => [x - centerX, y - centerY]),
  }
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

  for (const side of [-1, 1] as const) {
    addMember(context, {
      label: `${side === -1 ? 'Left' : 'Right'} floor rim board`,
      assembly: 'floor',
      layer: 'framing',
      materialId: joistMaterial,
      size: [joistWidth, joistDepth, lengthIn],
      position: [side * (widthIn / 2 - joistWidth / 2), joistCenterY, 0],
      cutLengthIn: lengthIn,
      idHint: 'floor-rim',
    })
  }

  const floorJoistPositions = memberCenterPositions(lengthIn, project.floor.spacingIn, joistWidth)
  for (const [index, z] of floorJoistPositions.entries()) {
    const atBack = index === 0
    const atFront = index === floorJoistPositions.length - 1
    addMember(context, {
      label: atBack ? 'Back floor joist' : atFront ? 'Front floor joist' : 'Floor joist',
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
  const subfloorCourses = insetPanelJoints(panelSegments(lengthIn, PANEL_LONG_EDGE))
  let subfloorPanel = 0
  for (const [courseIndex, rawZ] of subfloorCourses.entries()) {
    const xSegments = insetPanelJoints(
      panelSegments(widthIn, PANEL_SHORT_EDGE, courseIndex % 2 === 1 ? PANEL_SHORT_EDGE / 2 : 0),
    )
    for (const x of xSegments) {
      subfloorPanel += 1
      addMember(context, {
        label: `Subfloor panel ${subfloorPanel}`,
        assembly: 'floor',
        layer: 'sheathing',
        materialId: project.floor.sheathingMaterialId,
        size: [x.end - x.start, SUBFLOOR_THICKNESS, rawZ.end - rawZ.start],
        position: [(x.start + x.end) / 2, subfloorY, (rawZ.start + rawZ.end) / 2],
        idHint: 'subfloor-panel',
      })
    }
  }

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
  const headerLength = opening.widthIn + 3
  const headerPlyOffset = (studDepth - PLATE_THICKNESS) / 2

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

  for (const offset of [-headerPlyOffset, headerPlyOffset]) {
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
      opening.widthIn,
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
  panelIndex: number
}

interface PanelRectangle {
  left: number
  right: number
  bottom: number
  top: number
  panelIndex: number
}

function subtractOpening(rectangle: PanelRectangle, opening: Opening): PanelRectangle[] {
  const openingLeft = opening.centerOffsetIn - opening.widthIn / 2
  const openingRight = opening.centerOffsetIn + opening.widthIn / 2
  const openingBottom = opening.sillHeightIn
  const openingTop = opening.sillHeightIn + opening.heightIn
  const cutLeft = Math.max(rectangle.left, openingLeft)
  const cutRight = Math.min(rectangle.right, openingRight)
  const cutBottom = Math.max(rectangle.bottom, openingBottom)
  const cutTop = Math.min(rectangle.top, openingTop)

  if (cutLeft >= cutRight || cutBottom >= cutTop) return [rectangle]

  const pieces: PanelRectangle[] = []
  const addPiece = (left: number, right: number, bottom: number, top: number) => {
    if (right - left > 0.05 && top - bottom > 0.05) {
      pieces.push({ left, right, bottom, top, panelIndex: rectangle.panelIndex })
    }
  }
  addPiece(rectangle.left, rectangle.right, rectangle.bottom, cutBottom)
  addPiece(rectangle.left, rectangle.right, cutTop, rectangle.top)
  addPiece(rectangle.left, cutLeft, cutBottom, cutTop)
  addPiece(cutRight, rectangle.right, cutBottom, cutTop)
  return pieces
}

function wallSurfaceCells(spanIn: number, heightIn: number, openings: Opening[]): SurfaceCell[] {
  const horizontalPanels = insetPanelJoints(panelSegments(spanIn, PANEL_SHORT_EDGE))
  const verticalPanels = insetPanelJoints(panelSegments(heightIn, PANEL_LONG_EDGE)).map(
    (segment) => ({
      start: segment.start + heightIn / 2,
      end: segment.end + heightIn / 2,
    }),
  )
  const rectangles: PanelRectangle[] = []
  let panelIndex = 0

  for (const rawVertical of verticalPanels) {
    for (const horizontal of horizontalPanels) {
      panelIndex += 1
      let pieces: PanelRectangle[] = [
        {
          left: horizontal.start,
          right: horizontal.end,
          bottom: rawVertical.start,
          top: rawVertical.end,
          panelIndex,
        },
      ]
      for (const opening of openings) {
        pieces = pieces.flatMap((piece) => subtractOpening(piece, opening))
      }
      rectangles.push(...pieces)
    }
  }

  return rectangles.map((rectangle) => ({
    alongCenter: (rectangle.left + rectangle.right) / 2,
    verticalCenter: (rectangle.bottom + rectangle.top) / 2,
    width: rectangle.right - rectangle.left,
    height: rectangle.top - rectangle.bottom,
    panelIndex: rectangle.panelIndex,
  }))
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
      label: `${label} panel ${cell.panelIndex}`,
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
  const sheathingSpan = wallPanelLayoutSpan(wall.id, wall.surfaceSpanIn, 'sheathing')
  const sidingSpan = wallPanelLayoutSpan(wall.id, wall.surfaceSpanIn, 'siding')
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

function addExteriorCornerTrim(context: GeneratorContext, wallBaseIn: number): void {
  const { widthIn, lengthIn, wallHeightIn } = context.project.dimensions
  const trimMaterial: MaterialId = 'exterior-1x4-trim'
  const [trimThickness, trimWidth] = lumberDimensions(trimMaterial)
  const exteriorLayerDepth = WALL_SHEATHING_THICKNESS + SIDING_THICKNESS
  const centerY = wallBaseIn + wallHeightIn / 2

  for (const xSide of [-1, 1] as const) {
    for (const zSide of [-1, 1] as const) {
      const endLabel = zSide === 1 ? 'front' : 'back'
      const sideLabel = xSide === 1 ? 'right' : 'left'
      addMember(context, {
        label: `${endLabel} ${sideLabel} corner trim`,
        assembly: 'walls',
        layer: 'finish',
        materialId: trimMaterial,
        size: [trimWidth, wallHeightIn, trimThickness],
        position: [
          xSide * (widthIn / 2 + exteriorLayerDepth + trimThickness - trimWidth / 2),
          centerY,
          zSide * (lengthIn / 2 + exteriorLayerDepth + trimThickness / 2),
        ],
        cutLengthIn: wallHeightIn,
        idHint: 'corner-trim',
      })
      addMember(context, {
        label: `${sideLabel} ${endLabel} corner trim`,
        assembly: 'walls',
        layer: 'finish',
        materialId: trimMaterial,
        size: [trimThickness, wallHeightIn, trimWidth],
        position: [
          xSide * (widthIn / 2 + exteriorLayerDepth + trimThickness / 2),
          centerY,
          zSide * (lengthIn / 2 + exteriorLayerDepth - trimWidth / 2),
        ],
        cutLengthIn: wallHeightIn,
        idHint: 'corner-trim',
      })
    }
  }
}

function addGableSurfaceLayer(
  context: GeneratorContext,
  options: {
    spanIn: number
    riseIn: number
    baseY: number
    fixedIn: number
    thickness: number
    materialId: MaterialId
    layer: 'sheathing' | 'finish'
    label: string
    idHint: string
  },
): void {
  const horizontalPanels = insetPanelJoints(panelSegments(options.spanIn, PANEL_SHORT_EDGE))
  const verticalPanels = insetPanelJoints(positivePanelSegments(options.riseIn, PANEL_LONG_EDGE))
  const triangle: ProfilePoint[] = [
    [-options.spanIn / 2, 0],
    [options.spanIn / 2, 0],
    [0, options.riseIn],
  ]
  let panelIndex = 0

  for (const vertical of verticalPanels) {
    for (const horizontal of horizontalPanels) {
      panelIndex += 1
      const panel = clipPolygonToRectangle(triangle, {
        left: horizontal.start,
        right: horizontal.end,
        bottom: vertical.start,
        top: vertical.end,
      })
      if (panel.length < 3 || Math.abs(signedArea(panel)) < 0.01) continue

      addMember(context, {
        label: `${options.label} panel ${panelIndex}`,
        assembly: 'walls',
        layer: options.layer,
        materialId: options.materialId,
        ...profileGeometry(
          panel.map(([x, y]) => [x, options.baseY + y]),
          options.thickness,
          options.fixedIn,
        ),
        idHint: options.idHint,
      })
    }
  }
}

function addGableEndFraming(
  context: GeneratorContext,
  wallBaseIn: number,
  riseIn: number,
  roofBottomY: (horizontalRunIn: number) => number,
  ridgeBottomY: number,
  roofAngleDeg: number,
): number {
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
    for (const x of centeredMemberPositions(widthIn - studDepth * 2, project.walls.spacingIn)) {
      const left = x - PLATE_THICKNESS / 2
      const right = x + PLATE_THICKNESS / 2
      const centeredAtRidge = Math.abs(x) < 0.01
      const topLeft = centeredAtRidge ? ridgeBottomY : roofBottomY(Math.abs(left))
      const topRight = centeredAtRidge ? ridgeBottomY : roofBottomY(Math.abs(right))
      const longPointLength = Math.max(topLeft, topRight) - baseY
      if (longPointLength <= 0.5) continue
      const geometry = profileGeometry(
        [
          [left, baseY],
          [right, baseY],
          [right, topRight],
          [left, topLeft],
        ],
        studDepth,
        wall.fixedIn,
      )
      addMember(context, {
        label: `${wall.id} gable stud`,
        assembly: 'walls',
        layer: 'framing',
        materialId: studMaterial,
        ...geometry,
        cutLengthIn: longPointLength,
        idHint: 'gable-stud',
        fabrication: {
          longPointLengthIn: longPointLength,
          cuts: [
            {
              id: centeredAtRidge ? 'top-square' : 'top-slope',
              label: centeredAtRidge ? 'Top square cut' : 'Top slope cut',
              type: centeredAtRidge ? 'square' : 'slope',
              angleDeg: centeredAtRidge ? undefined : roofAngleDeg,
              note: centeredAtRidge
                ? 'Cut square beneath the ridge board.'
                : 'Long point follows the underside of the common rafter.',
            },
            { id: 'bottom-square', label: 'Bottom square cut', type: 'square' },
          ],
        },
      })
    }

    addGableSurfaceLayer(context, {
      spanIn: widthIn,
      riseIn,
      baseY,
      fixedIn: wall.fixedIn + wall.outward * (studDepth / 2 + WALL_SHEATHING_THICKNESS / 2),
      thickness: WALL_SHEATHING_THICKNESS,
      materialId: project.walls.sheathingMaterialId,
      layer: 'sheathing',
      label: `${wall.id} gable sheathing`,
      idHint: 'gable-sheathing',
    })
    addGableSurfaceLayer(context, {
      spanIn: widthIn,
      riseIn,
      baseY,
      fixedIn:
        wall.fixedIn +
        wall.outward * (studDepth / 2 + WALL_SHEATHING_THICKNESS + SIDING_THICKNESS / 2),
      thickness: SIDING_THICKNESS,
      materialId: project.walls.sidingMaterialId,
      layer: 'finish',
      label: `${wall.id} gable siding`,
      idHint: 'gable-siding',
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
  const roofLength = lengthIn + overhang * 2
  const roofBase = wallBaseIn + wallHeightIn
  const angle = Math.atan(pitch)
  const angleDeg = (angle * 180) / Math.PI
  const cosine = Math.cos(angle)
  const rafterMaterial = project.roof.rafterSize as MaterialId
  const [rafterThickness, rafterDepth] = lumberDimensions(rafterMaterial)
  const [, studDepth] = lumberDimensions(project.walls.studSize as MaterialId)
  const ridgeMaterial = (['2x4', '2x6', '2x8', '2x10', '2x12'] as const).find(
    (materialId) => (getMaterial(materialId).actualDepthIn ?? 0) >= rafterDepth / cosine,
  )
  const ridgeBoardMaterial: MaterialId = ridgeMaterial ?? '2x12'
  const [ridgeThickness, ridgeDepth] = lumberDimensions(ridgeBoardMaterial)
  const ridgeFaceRun = ridgeThickness / 2
  const maximumBirdsmouthDepth = rafterDepth / 3
  const fullPlateNotchDepth = studDepth * pitch * cosine
  const birdsmouthSeatLength =
    fullPlateNotchDepth <= maximumBirdsmouthDepth
      ? studDepth
      : Math.max(PLATE_THICKNESS, maximumBirdsmouthDepth / (pitch * cosine))
  const centerPeakY = roofBase + (run - birdsmouthSeatLength) * pitch + rafterDepth / (2 * cosine)
  const centerTailY = centerPeakY - extendedRun * pitch
  const topY = (horizontalRunIn: number) =>
    centerPeakY - horizontalRunIn * pitch + rafterDepth / (2 * cosine)
  const bottomY = (horizontalRunIn: number) =>
    centerPeakY - horizontalRunIn * pitch - rafterDepth / (2 * cosine)
  const ridgeTopY = topY(ridgeFaceRun)
  const ridgeBottomY = ridgeTopY - ridgeDepth
  const rafterLongPointLength = Math.hypot(
    extendedRun - ridgeFaceRun,
    topY(extendedRun) - topY(ridgeFaceRun),
  )
  const roofSlopeLength = Math.hypot(extendedRun, extendedRun * pitch)
  const birdsmouthDepth = (roofBase - bottomY(run)) * cosine
  const rise = run * pitch

  const rafterGeometry = (side: -1 | 1, fixedIn: number) => {
    const signed = (horizontalRunIn: number): number => side * horizontalRunIn
    return profileGeometry(
      [
        [signed(ridgeFaceRun), bottomY(ridgeFaceRun)],
        [signed(run - birdsmouthSeatLength), roofBase],
        [signed(run), roofBase],
        [signed(run), bottomY(run)],
        [signed(extendedRun), bottomY(extendedRun)],
        [signed(extendedRun), topY(extendedRun)],
        [signed(ridgeFaceRun), topY(ridgeFaceRun)],
      ],
      rafterThickness,
      fixedIn,
    )
  }

  const rafterFabrication: FabricationSpec = {
    longPointLengthIn: rafterLongPointLength,
    cuts: [
      {
        id: 'ridge-plumb',
        label: 'Ridge plumb cut',
        type: 'plumb',
        angleDeg,
        note: 'Long point butts against the face of the ridge board.',
      },
      {
        id: 'birdsmouth',
        label: 'Birdsmouth seat',
        type: 'birdsmouth',
        depthIn: birdsmouthDepth,
        seatLengthIn: birdsmouthSeatLength,
        note:
          birdsmouthSeatLength < studDepth
            ? 'Seat is shortened to keep the notch within one-third of the rafter depth.'
            : 'Horizontal seat bears across the wall top plate.',
      },
      {
        id: 'tail-plumb',
        label: 'Tail plumb cut',
        type: 'plumb',
        angleDeg,
        note: 'Vertical tail cut establishes the fascia line.',
      },
    ],
  }

  const gableAreaSqIn = addGableEndFraming(
    context,
    wallBaseIn,
    rise,
    bottomY,
    ridgeBottomY,
    angleDeg,
  )
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
        ...rafterGeometry(side, z),
        cutLengthIn: rafterLongPointLength,
        idHint: 'rafter',
        fabrication: rafterFabrication,
      })
    }

    const tieMaterial: MaterialId = '2x4'
    const [, tieDepth] = lumberDimensions(tieMaterial)
    addMember(context, {
      label: 'Rafter tie',
      assembly: 'roof',
      layer: 'framing',
      materialId: tieMaterial,
      size: [widthIn, tieDepth, PLATE_THICKNESS],
      position: [0, roofBase - tieDepth / 2, z + (z >= 0 ? -rafterThickness : rafterThickness)],
      cutLengthIn: widthIn,
      idHint: 'rafter-tie',
      fabrication: {
        longPointLengthIn: widthIn,
        cuts: [
          { id: 'left-square', label: 'Left square cut', type: 'square' },
          { id: 'right-square', label: 'Right square cut', type: 'square' },
        ],
      },
    })
  }

  if (overhang > 0) {
    const flyRafterOffset = roofLength / 2 - rafterThickness / 2
    const lookoutLength = Math.max(overhang - rafterThickness, 0)
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
          ...rafterGeometry(side, end * flyRafterOffset),
          cutLengthIn: rafterLongPointLength,
          idHint: 'fly-rafter',
          fabrication: rafterFabrication,
        })

        for (const lookoutRun of lookoutLength > 0 ? lookoutRuns : []) {
          const centerlineX = side * lookoutRun
          const centerlineY = centerPeakY - lookoutRun * pitch
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
            fabrication: {
              longPointLengthIn: lookoutLength,
              cuts: [
                { id: 'inner-square', label: 'Inner square cut', type: 'square' },
                { id: 'outer-square', label: 'Outer square cut', type: 'square' },
              ],
            },
          })
        }
      }
    }
  }

  addMember(context, {
    label: 'Roof ridge board',
    assembly: 'roof',
    layer: 'framing',
    materialId: ridgeBoardMaterial,
    size: [ridgeThickness, ridgeDepth, roofLength],
    position: [0, ridgeTopY - ridgeDepth / 2, 0],
    cutLengthIn: roofLength,
    idHint: 'ridge-board',
  })

  for (const side of [-1, 1] as const) {
    const rotationZ = side === -1 ? angle : -angle
    const sheathingOffset = rafterDepth / 2 + WALL_SHEATHING_THICKNESS / 2
    const roofingOffset = rafterDepth / 2 + WALL_SHEATHING_THICKNESS + ROOFING_THICKNESS / 2
    const slopeCourses = insetPanelJoints(positivePanelSegments(roofSlopeLength, PANEL_SHORT_EDGE))
    let sheathingPanel = 0
    for (const [courseIndex, slope] of slopeCourses.entries()) {
      const lengthPanels = insetPanelJoints(
        panelSegments(roofLength, PANEL_LONG_EDGE, courseIndex % 2 === 1 ? PANEL_SHORT_EDGE : 0),
      )
      for (const length of lengthPanels) {
        sheathingPanel += 1
        const slopeCenter = (slope.start + slope.end) / 2
        const horizontalRun = slopeCenter * cosine
        addMember(context, {
          label: `${side === -1 ? 'Left' : 'Right'} roof sheathing panel ${sheathingPanel}`,
          assembly: 'roof',
          layer: 'sheathing',
          materialId: project.roof.sheathingMaterialId,
          size: [slope.end - slope.start, WALL_SHEATHING_THICKNESS, length.end - length.start],
          position: [
            side * horizontalRun + side * Math.sin(angle) * sheathingOffset,
            centerPeakY - slopeCenter * Math.sin(angle) + Math.cos(angle) * sheathingOffset,
            (length.start + length.end) / 2,
          ],
          rotation: [0, 0, rotationZ],
          idHint: 'roof-sheathing-panel',
        })
      }
    }
    addMember(context, {
      label: `${side === -1 ? 'Left' : 'Right'} roofing`,
      assembly: 'roof',
      layer: 'finish',
      materialId: project.roof.roofingMaterialId,
      size: [roofSlopeLength, ROOFING_THICKNESS, roofLength],
      position: [
        (side * extendedRun) / 2 + side * Math.sin(angle) * roofingOffset,
        (centerTailY + centerPeakY) / 2 + Math.cos(angle) * roofingOffset,
        0,
      ],
      rotation: [0, 0, rotationZ],
      idHint: 'roofing',
    })
  }

  const roofAreaSqIn = 2 * roofSlopeLength * roofLength
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

  const peakHeightIn = topY(0) + Math.cos(angle) * (WALL_SHEATHING_THICKNESS + ROOFING_THICKNESS)
  return { roofAreaSqIn, peakHeightIn, gableAreaSqIn }
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
  addExteriorCornerTrim(context, wallBaseIn)
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
