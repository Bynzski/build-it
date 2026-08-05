import type { BuildItProject, Opening, WallId } from '../model/project'
import type {
  AssemblyId,
  ConstructionMember,
  ConstructionRole,
  FabricationSpec,
  GeneratedBuilding,
  MemberLayer,
  ProfilePoint,
  ProfileRegion,
  SurfaceQuantity,
  Vector3Tuple,
} from './construction'
import { constructionRules, wallPanelLayoutSpan } from './constructionRules'
import { estimateMaterials } from './estimate'
import { estimateFasteners } from './fasteners'
import { edgeDatumMemberCenters, supportAwarePanelSegments } from './framingLayout'
import { getGuidance } from './guidance'
import {
  getMaterial,
  getPanelCladdingInstallation,
  getRoofCladdingInstallation,
  type MaterialId,
} from './materials'

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
  role?: ConstructionRole
  scopeId?: string
  scopeLabel?: string
  kind?: string
  materialId: MaterialId
  size: Vector3Tuple
  position: Vector3Tuple
  rotation?: Vector3Tuple
  cutLengthIn?: number
  idHint?: string
  shape?: 'box' | 'gable' | 'profile' | 'cut-panel' | 'ribbed-panel'
  profile?: ProfilePoint[]
  profileRegions?: ProfileRegion[]
  profileExtrusionIn?: number
  ribbedPanel?: ConstructionMember['ribbedPanel']
  fabrication?: FabricationSpec
}

const assemblyLabels: Record<AssemblyId, string> = {
  foundation: 'Foundation',
  floor: 'Floor',
  walls: 'Exterior walls',
  roof: 'Roof',
}

function defaultRole(layer: MemberLayer): ConstructionRole {
  if (layer === 'framing') return 'structure'
  if (layer === 'sheathing') return 'sheathing'
  if (layer === 'weather') return 'weatherproofing'
  return 'exterior-finish'
}

function wallScope(wallId: WallId): { scopeId: string; scopeLabel: string } {
  return {
    scopeId: `walls:${wallId}`,
    scopeLabel: `${wallId[0].toUpperCase()}${wallId.slice(1)} wall`,
  }
}

function roofSlopeScope(side: -1 | 1): { scopeId: string; scopeLabel: string } {
  return side === -1
    ? { scopeId: 'roof:left', scopeLabel: 'Left roof slope' }
    : { scopeId: 'roof:right', scopeLabel: 'Right roof slope' }
}

const SUBFLOOR_THICKNESS = constructionRules.layers.subfloorThicknessIn
const WALL_SHEATHING_THICKNESS = constructionRules.layers.wallSheathingThicknessIn
const WEATHER_BARRIER_THICKNESS = constructionRules.layers.weatherBarrierThicknessIn
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

function insetPanelJoints(
  segments: PanelSegment[],
  gapIn = PANEL_GAP,
  placement: 'centered' | 'clearance-above' = 'centered',
): PanelSegment[] {
  return segments.map((segment, index) => ({
    start: segment.start + (index > 0 ? (placement === 'clearance-above' ? gapIn : gapIn / 2) : 0),
    end: segment.end - (index < segments.length - 1 && placement === 'centered' ? gapIn / 2 : 0),
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

function centeredCoverageSegments(spanIn: number, coverageWidthIn: number): PanelSegment[] {
  const panelCount = Math.max(1, Math.ceil(spanIn / coverageWidthIn))
  if (panelCount === 1) return [{ start: -spanIn / 2, end: spanIn / 2 }]

  const interiorCount = Math.max(0, panelCount - 2)
  const edgeCoverage = (spanIn - interiorCount * coverageWidthIn) / 2
  const segments: PanelSegment[] = []
  let cursor = -spanIn / 2
  for (let index = 0; index < panelCount; index += 1) {
    const width = index === 0 || index === panelCount - 1 ? edgeCoverage : coverageWidthIn
    segments.push({ start: cursor, end: cursor + width })
    cursor += width
  }
  return segments
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
    role: options.role ?? defaultRole(options.layer),
    scopeId: options.scopeId ?? options.assembly,
    scopeLabel: options.scopeLabel ?? assemblyLabels[options.assembly],
    kind: options.kind ?? options.idHint ?? options.assembly,
    materialId: options.materialId,
    size: options.size,
    position: options.position,
    rotation: options.rotation,
    cutLengthIn: options.cutLengthIn,
    shape: options.shape,
    profile: options.profile,
    profileRegions: options.profileRegions,
    profileExtrusionIn: options.profileExtrusionIn,
    ribbedPanel: options.ribbedPanel,
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

function addFloor(context: GeneratorContext): {
  wallBaseIn: number
  floorFrameBottomIn: number
  floorAreaSqIn: number
} {
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

  const floorJoistPositions = edgeDatumMemberCenters(
    lengthIn,
    lengthIn,
    project.floor.spacingIn,
    joistWidth,
  )
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
  const subfloorRows = insetPanelJoints(panelSegments(widthIn, PANEL_SHORT_EDGE))
  let subfloorPanel = 0
  for (const [rowIndex, x] of subfloorRows.entries()) {
    const lengthSegments = insetPanelJoints(
      supportAwarePanelSegments(
        lengthIn,
        PANEL_LONG_EDGE,
        floorJoistPositions,
        rowIndex % 2 === 0 ? PANEL_LONG_EDGE : PANEL_SHORT_EDGE,
      ),
    )
    for (const length of lengthSegments) {
      subfloorPanel += 1
      addMember(context, {
        label: `Subfloor panel ${subfloorPanel}`,
        assembly: 'floor',
        layer: 'sheathing',
        materialId: project.floor.sheathingMaterialId,
        size: [x.end - x.start, SUBFLOOR_THICKNESS, length.end - length.start],
        position: [(x.start + x.end) / 2, subfloorY, (length.start + length.end) / 2],
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
    floorFrameBottomIn: skidDepth,
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
    ...wallScope(wall.id),
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
    ...wallScope(wall.id),
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
  layoutPositions: number[],
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
    for (const position of openingCripplePositions(opening, layoutPositions)) {
      addVerticalWallMember(
        context,
        wall,
        studMaterial,
        studDepth,
        position,
        crippleBase,
        crippleLength,
        'Window lower cripple',
        'cripple-stud',
      )
    }
  }

  const upperCrippleBase = headerBottom + headerDepth
  const upperCrippleLength = wallBaseIn + wallHeightIn - PLATE_THICKNESS * 2 - upperCrippleBase
  for (const position of openingCripplePositions(opening, layoutPositions)) {
    addVerticalWallMember(
      context,
      wall,
      studMaterial,
      studDepth,
      position,
      upperCrippleBase,
      upperCrippleLength,
      `${opening.type} upper cripple`,
      'cripple-stud',
    )
  }
}

function openingCripplePositions(opening: Opening, layoutPositions: number[]): number[] {
  const left = opening.centerOffsetIn - opening.widthIn / 2
  const right = opening.centerOffsetIn + opening.widthIn / 2
  const positions = layoutPositions
    .filter((position) => position >= left - 0.01 && position <= right + 0.01)
    .map((position) => {
      if (position - left < PLATE_THICKNESS) return left + PLATE_THICKNESS / 2
      if (right - position < PLATE_THICKNESS) return right - PLATE_THICKNESS / 2
      return position
    })

  return [...new Set(positions)]
}

function subtractHorizontalRanges(segment: PanelSegment, ranges: PanelSegment[]): PanelSegment[] {
  let segments = [segment]
  for (const range of ranges) {
    segments = segments.flatMap((current) => {
      const overlapStart = Math.max(current.start, range.start)
      const overlapEnd = Math.min(current.end, range.end)
      if (overlapStart >= overlapEnd) return [current]
      const pieces: PanelSegment[] = []
      if (overlapStart - current.start > 0.5) {
        pieces.push({ start: current.start, end: overlapStart })
      }
      if (current.end - overlapEnd > 0.5) {
        pieces.push({ start: overlapEnd, end: current.end })
      }
      return pieces
    })
  }
  return segments
}

function addWallPanelJointBlocking(
  context: GeneratorContext,
  wall: WallDefinition,
  wallBaseIn: number,
  verticalPanels: PanelSegment[],
  studMaterial: MaterialId,
  studDepth: number,
  layoutPositions: number[],
  openings: Opening[],
): void {
  const horizontalJoints = verticalPanels.slice(0, -1).map((panel) => panel.end)

  for (const height of horizontalJoints) {
    if (Math.abs(height) < 0.01) continue
    const upperPanelFastenerHeight =
      height + PANEL_GAP / 2 + constructionRules.walls.panelEdgeFastenerSetbackIn
    const jointFallsOnBottomPlate = height > 0 && height < PLATE_THICKNESS
    const needsBackingAboveBottomPlate =
      jointFallsOnBottomPlate && upperPanelFastenerHeight > PLATE_THICKNESS
    if (jointFallsOnBottomPlate && !needsBackingAboveBottomPlate) continue
    const blockingCenterHeight = needsBackingAboveBottomPlate ? PLATE_THICKNESS * 1.5 : height
    const openingRanges = openings
      .filter(
        (opening) =>
          height > opening.sillHeightIn + 0.01 &&
          height < opening.sillHeightIn + opening.heightIn - 0.01,
      )
      .map((opening) => ({
        start: opening.centerOffsetIn - opening.widthIn / 2,
        end: opening.centerOffsetIn + opening.widthIn / 2,
      }))

    for (let index = 0; index < layoutPositions.length - 1; index += 1) {
      const bay = {
        start: layoutPositions[index] + PLATE_THICKNESS / 2,
        end: layoutPositions[index + 1] - PLATE_THICKNESS / 2,
      }
      for (const blocking of subtractHorizontalRanges(bay, openingRanges)) {
        addHorizontalWallMember(
          context,
          wall,
          studMaterial,
          studDepth,
          (blocking.start + blocking.end) / 2,
          wallBaseIn + blockingCenterHeight,
          blocking.end - blocking.start,
          PLATE_THICKNESS,
          `${wall.id} sheathing joint blocking`,
          'wall-panel-blocking',
        )
      }
    }
  }
}

function wallEnvelopeVerticalSegments(
  wallHeightIn: number,
  floorEdgeDepthIn: number,
  maximumPanelHeightIn: number = PANEL_LONG_EDGE,
): PanelSegment[] {
  const bottom = -floorEdgeDepthIn
  const segments: PanelSegment[] = []
  let cursor = wallHeightIn

  while (cursor - bottom > maximumPanelHeightIn + 0.01) {
    segments.unshift({ start: cursor - maximumPanelHeightIn, end: cursor })
    cursor -= maximumPanelHeightIn
  }
  if (cursor - bottom > 0.01) segments.unshift({ start: bottom, end: cursor })
  return segments
}

interface SurfaceCell {
  alongCenter: number
  verticalCenter: number
  width: number
  height: number
  panelIndex: number
  profileRegions?: ProfileRegion[]
  sourceKind?: 'sheet' | 'offcut'
}

interface PanelRectangle {
  left: number
  right: number
  bottom: number
  top: number
  panelIndex: number
}

interface GridPoint {
  x: number
  y: number
}

function pointInsidePolygon(point: ProfilePoint, polygon: ProfilePoint[]): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [x, y] = polygon[index]
    const [previousX, previousY] = polygon[previous]
    const crosses =
      y > point[1] !== previousY > point[1] &&
      point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x
    if (crosses) inside = !inside
  }
  return inside
}

function panelCutRegions(rectangle: PanelRectangle, openings: Opening[]): ProfileRegion[] {
  const cuts = openings
    .map((opening) => ({
      left: Math.max(rectangle.left, opening.centerOffsetIn - opening.widthIn / 2),
      right: Math.min(rectangle.right, opening.centerOffsetIn + opening.widthIn / 2),
      bottom: Math.max(rectangle.bottom, opening.sillHeightIn),
      top: Math.min(rectangle.top, opening.sillHeightIn + opening.heightIn),
    }))
    .filter((cut) => cut.right - cut.left > 0.01 && cut.top - cut.bottom > 0.01)

  const uniqueSorted = (values: number[]) =>
    [...new Set(values.map((value) => Math.round(value * 10000) / 10000))].sort(
      (first, second) => first - second,
    )
  const xs = uniqueSorted([
    rectangle.left,
    rectangle.right,
    ...cuts.flatMap((cut) => [cut.left, cut.right]),
  ])
  const ys = uniqueSorted([
    rectangle.bottom,
    rectangle.top,
    ...cuts.flatMap((cut) => [cut.bottom, cut.top]),
  ])
  const filled = Array.from({ length: ys.length - 1 }, (_, yIndex) =>
    Array.from({ length: xs.length - 1 }, (_, xIndex) => {
      const centerX = (xs[xIndex] + xs[xIndex + 1]) / 2
      const centerY = (ys[yIndex] + ys[yIndex + 1]) / 2
      return !cuts.some(
        (cut) =>
          centerX > cut.left && centerX < cut.right && centerY > cut.bottom && centerY < cut.top,
      )
    }),
  )
  const isFilled = (x: number, y: number) => filled[y]?.[x] === true
  const edgeMap = new Map<string, GridPoint[]>()
  const addEdge = (start: GridPoint, end: GridPoint) => {
    const key = `${start.x},${start.y}`
    const edges = edgeMap.get(key)
    if (edges) edges.push(end)
    else edgeMap.set(key, [end])
  }

  for (let y = 0; y < ys.length - 1; y += 1) {
    for (let x = 0; x < xs.length - 1; x += 1) {
      if (!isFilled(x, y)) continue
      if (!isFilled(x, y - 1)) addEdge({ x, y }, { x: x + 1, y })
      if (!isFilled(x + 1, y)) addEdge({ x: x + 1, y }, { x: x + 1, y: y + 1 })
      if (!isFilled(x, y + 1)) addEdge({ x: x + 1, y: y + 1 }, { x, y: y + 1 })
      if (!isFilled(x - 1, y)) addEdge({ x, y: y + 1 }, { x, y })
    }
  }

  const loops: ProfilePoint[][] = []
  while ([...edgeMap.values()].some((edges) => edges.length > 0)) {
    const startEntry = [...edgeMap.entries()].find(([, edges]) => edges.length > 0)
    if (!startEntry) break
    const [startKey] = startEntry
    const [startX, startY] = startKey.split(',').map(Number)
    const start = { x: startX, y: startY }
    const loop: GridPoint[] = [start]
    let current = start

    for (let guard = 0; guard < edgeMap.size * 4; guard += 1) {
      const key = `${current.x},${current.y}`
      const candidates = edgeMap.get(key)
      const next = candidates?.shift()
      if (!next) break
      if (next.x === start.x && next.y === start.y) break
      loop.push(next)
      current = next
    }

    if (loop.length >= 3) loops.push(loop.map((point) => [xs[point.x], ys[point.y]]))
  }

  const outlines = loops.filter((loop) => signedArea(loop) > 0)
  const holes = loops.filter((loop) => signedArea(loop) < 0)
  return outlines.map((outline) => ({
    outline,
    holes: holes.filter((hole) => {
      const center: ProfilePoint = [
        hole.reduce((sum, point) => sum + point[0], 0) / hole.length,
        hole.reduce((sum, point) => sum + point[1], 0) / hole.length,
      ]
      return pointInsidePolygon(center, outline)
    }),
  }))
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

function extendOutsidePanelEdges(
  segments: PanelSegment[],
  edgeExtensionIn: number,
): PanelSegment[] {
  return segments.map((segment, index) => ({
    start: segment.start - (index === 0 ? edgeExtensionIn : 0),
    end: segment.end + (index === segments.length - 1 ? edgeExtensionIn : 0),
  }))
}

function wallSurfaceCells(
  layoutSpanIn: number,
  rawVerticalPanels: PanelSegment[],
  openings: Opening[],
  supportCentersIn: number[],
  edgeExtensionIn = 0,
  verticalJointGapIn = PANEL_GAP,
  panelWidthIn: number = PANEL_SHORT_EDGE,
  verticalJointPlacement: 'centered' | 'clearance-above' = 'centered',
  panelJointGapIn = PANEL_GAP,
): SurfaceCell[] {
  const horizontalPanels = insetPanelJoints(
    extendOutsidePanelEdges(
      supportAwarePanelSegments(layoutSpanIn, panelWidthIn, supportCentersIn, panelWidthIn),
      edgeExtensionIn,
    ),
    panelJointGapIn,
  )
  const verticalPanels = insetPanelJoints(
    rawVerticalPanels,
    verticalJointGapIn,
    verticalJointPlacement,
  )
  const cells: SurfaceCell[] = []
  let panelIndex = 0

  for (const [verticalIndex, rawVertical] of verticalPanels.entries()) {
    for (const horizontal of horizontalPanels) {
      panelIndex += 1
      const rectangle = {
        left: horizontal.start,
        right: horizontal.end,
        bottom: rawVertical.start,
        top: rawVertical.end,
        panelIndex,
      }
      const profileRegions = panelCutRegions(rectangle, openings)
      if (profileRegions.length === 0) continue
      cells.push({
        alongCenter: (rectangle.left + rectangle.right) / 2,
        verticalCenter: (rectangle.bottom + rectangle.top) / 2,
        width: rectangle.right - rectangle.left,
        height: rectangle.top - rectangle.bottom,
        panelIndex,
        profileRegions: profileRegions.map((region) => ({
          outline: region.outline.map(([x, y]) => [
            x - (rectangle.left + rectangle.right) / 2,
            y - (rectangle.bottom + rectangle.top) / 2,
          ]),
          holes: region.holes.map((hole) =>
            hole.map(([x, y]) => [
              x - (rectangle.left + rectangle.right) / 2,
              y - (rectangle.bottom + rectangle.top) / 2,
            ]),
          ),
        })),
        sourceKind:
          rawVerticalPanels.length > 1 &&
          verticalIndex === 0 &&
          rawVerticalPanels[0].end - rawVerticalPanels[0].start <=
            constructionRules.walls.maximumReusableClosureStripIn
            ? 'offcut'
            : 'sheet',
      })
    }
  }

  return cells
}

function continuousWallSurfaceCells(
  spanIn: number,
  bottomIn: number,
  topIn: number,
  openings: Opening[],
): SurfaceCell[] {
  let rectangles: PanelRectangle[] = [
    {
      left: -spanIn / 2,
      right: spanIn / 2,
      bottom: bottomIn,
      top: topIn,
      panelIndex: 1,
    },
  ]
  for (const opening of openings) {
    rectangles = rectangles.flatMap((rectangle) => subtractOpening(rectangle, opening))
  }
  return rectangles.map((rectangle, index) => ({
    alongCenter: (rectangle.left + rectangle.right) / 2,
    verticalCenter: (rectangle.bottom + rectangle.top) / 2,
    width: rectangle.right - rectangle.left,
    height: rectangle.top - rectangle.bottom,
    panelIndex: index + 1,
  }))
}

function addWallJointFlashing(
  context: GeneratorContext,
  wall: WallDefinition,
  wallBaseIn: number,
  studDepth: number,
  verticalPanels: PanelSegment[],
  openings: Opening[],
  claddingThicknessIn: number,
  weatherBarrierThicknessIn: number,
): void {
  const flashingMaterial: MaterialId = 'z-flashing'
  const projection = constructionRules.flashing.projectionIn
  const visibleHeight = constructionRules.flashing.visibleHeightIn
  const fixedOffset =
    wall.outward *
    (studDepth / 2 +
      WALL_SHEATHING_THICKNESS +
      weatherBarrierThicknessIn +
      claddingThicknessIn +
      projection / 2)

  for (const joint of verticalPanels.slice(0, -1).map((panel) => panel.end)) {
    const openingRanges = openings
      .filter(
        (opening) =>
          joint >= opening.sillHeightIn - 0.01 &&
          joint <= opening.sillHeightIn + opening.heightIn + 0.01,
      )
      .map((opening) => ({
        start: opening.centerOffsetIn - opening.widthIn / 2,
        end: opening.centerOffsetIn + opening.widthIn / 2,
      }))
    const wallSegments = subtractHorizontalRanges(
      { start: -wall.surfaceSpanIn / 2, end: wall.surfaceSpanIn / 2 },
      openingRanges,
    )

    for (const segment of wallSegments) {
      addMember(context, {
        label: `${wall.id} wall horizontal Z-flashing`,
        assembly: 'walls',
        layer: 'weather',
        role: 'trim-flashing',
        ...wallScope(wall.id),
        materialId: flashingMaterial,
        size: wallMemberSize(wall, segment.end - segment.start, visibleHeight, projection),
        position: wallVector(
          wall,
          (segment.start + segment.end) / 2,
          wallBaseIn + joint,
          fixedOffset,
        ),
        cutLengthIn: segment.end - segment.start,
        idHint: 'z-flashing',
      })
    }
  }
}

function addOpeningHeadFlashing(
  context: GeneratorContext,
  wall: WallDefinition,
  wallBaseIn: number,
  studDepth: number,
  openings: Opening[],
  claddingThicknessIn: number,
  weatherBarrierThicknessIn: number,
): void {
  const projection = constructionRules.flashing.projectionIn
  const visibleHeight = constructionRules.flashing.visibleHeightIn
  const endExtension = constructionRules.flashing.openingEndExtensionIn
  const fixedOffset =
    wall.outward *
    (studDepth / 2 +
      WALL_SHEATHING_THICKNESS +
      weatherBarrierThicknessIn +
      claddingThicknessIn +
      projection / 2)

  for (const opening of openings) {
    const start = Math.max(
      -wall.surfaceSpanIn / 2,
      opening.centerOffsetIn - opening.widthIn / 2 - endExtension,
    )
    const end = Math.min(
      wall.surfaceSpanIn / 2,
      opening.centerOffsetIn + opening.widthIn / 2 + endExtension,
    )
    if (end - start <= 0.5) continue
    addMember(context, {
      label: `${opening.type} head Z-flashing`,
      assembly: 'walls',
      layer: 'weather',
      role: 'trim-flashing',
      ...wallScope(wall.id),
      materialId: 'z-flashing',
      size: wallMemberSize(wall, end - start, visibleHeight, projection),
      position: wallVector(
        wall,
        (start + end) / 2,
        wallBaseIn + opening.sillHeightIn + opening.heightIn,
        fixedOffset,
      ),
      cutLengthIn: end - start,
      idHint: 'opening-head-flashing',
    })
  }
}

function claddingOpenings(
  openings: Opening[],
  edgeClearanceIn: number,
  headClearanceIn: number,
): Opening[] {
  return openings.map((opening) => {
    const bottom =
      opening.type === 'door' ? opening.sillHeightIn : opening.sillHeightIn - edgeClearanceIn
    const top = opening.sillHeightIn + opening.heightIn + headClearanceIn
    return {
      ...opening,
      widthIn: opening.widthIn + edgeClearanceIn * 2,
      sillHeightIn: Math.max(0, bottom),
      heightIn: top - Math.max(0, bottom),
    }
  })
}

function addWallSurfaceLayer(
  context: GeneratorContext,
  wall: WallDefinition,
  cells: SurfaceCell[],
  wallBaseIn: number,
  studDepth: number,
  materialId: MaterialId,
  thickness: number,
  layer: 'sheathing' | 'weather' | 'finish',
  distanceFromFraming: number,
  label: string,
): void {
  for (const cell of cells) {
    const fixedOffset = wall.outward * (studDepth / 2 + distanceFromFraming + thickness / 2)
    const cutPanelGeometry = cell.profileRegions
      ? {
          shape: 'cut-panel' as const,
          profileRegions: cell.profileRegions,
          profileExtrusionIn: thickness,
          rotation: wall.orientation === 'z' ? ([0, -Math.PI / 2, 0] as Vector3Tuple) : undefined,
        }
      : {}
    addMember(context, {
      label: `${label} ${layer === 'weather' ? 'section' : 'panel'} ${cell.panelIndex}`,
      assembly: 'walls',
      layer,
      ...wallScope(wall.id),
      materialId,
      size: wallMemberSize(wall, cell.width, cell.height, thickness),
      position: wallVector(wall, cell.alongCenter, wallBaseIn + cell.verticalCenter, fixedOffset),
      idHint: layer === 'finish' ? 'siding' : layer === 'weather' ? 'wall-wrb' : 'wall-sheathing',
      ...cutPanelGeometry,
    })
  }
}

function addWall(
  context: GeneratorContext,
  wall: WallDefinition,
  wallBaseIn: number,
  floorFrameBottomIn: number,
): number {
  const { project } = context
  const height = project.dimensions.wallHeightIn
  const studMaterial = project.walls.studSize as MaterialId
  const [, studDepth] = lumberDimensions(studMaterial)
  const cladding = getPanelCladdingInstallation(project.walls.sidingMaterialId)
  const weatherBarrierThickness = cladding.requiresWeatherBarrier ? WEATHER_BARRIER_THICKNESS : 0
  const openings = openingOnWall(project, wall.id)
  const studLength = height - PLATE_THICKNESS * 3
  const studBase = wallBaseIn + PLATE_THICKNESS
  const envelopeBottomIn = Math.max(
    floorFrameBottomIn,
    constructionRules.site.minimumUntreatedWoodClearanceIn,
  )
  const floorEdgeDepth = wallBaseIn - envelopeBottomIn
  const sheathingVerticalPanels = wallEnvelopeVerticalSegments(height, floorEdgeDepth)
  const claddingVerticalPanels = wallEnvelopeVerticalSegments(
    height,
    floorEdgeDepth,
    cladding.panelHeightIn,
  )
  const layoutPositions = edgeDatumMemberCenters(
    wall.surfaceSpanIn,
    wall.spanIn,
    project.walls.spacingIn,
  )

  for (const position of layoutPositions) {
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
      layoutPositions,
    )
  }

  addWallPanelJointBlocking(
    context,
    wall,
    wallBaseIn,
    sheathingVerticalPanels,
    studMaterial,
    studDepth,
    layoutPositions,
    openings,
  )

  const openingArea = openings.reduce(
    (total, opening) => total + opening.widthIn * opening.heightIn,
    0,
  )
  const netArea = Math.max(0, wall.surfaceSpanIn * height - openingArea)
  const sheathingSpan = wallPanelLayoutSpan(wall.id, wall.surfaceSpanIn, 'sheathing')
  const sidingSpan = wallPanelLayoutSpan(wall.id, wall.surfaceSpanIn, 'siding')
  const sheathingCells = wallSurfaceCells(
    wall.surfaceSpanIn,
    sheathingVerticalPanels,
    openings,
    layoutPositions,
    (sheathingSpan - wall.surfaceSpanIn) / 2,
  )
  const sidingOpenings = claddingOpenings(
    openings,
    cladding.openingClearanceIn,
    cladding.horizontalJoint.clearanceAboveIn,
  )
  const sidingCells = wallSurfaceCells(
    wall.surfaceSpanIn,
    claddingVerticalPanels,
    sidingOpenings,
    layoutPositions,
    (sidingSpan - wall.surfaceSpanIn) / 2,
    cladding.horizontalJoint.clearanceAboveIn,
    cladding.panelWidthIn,
    'clearance-above',
    cladding.verticalJointGapIn,
  )
  const weatherBarrierCells = continuousWallSurfaceCells(
    wall.surfaceSpanIn,
    -floorEdgeDepth,
    height,
    openings,
  )

  if (cladding.requiresWeatherBarrier) {
    addWallSurfaceLayer(
      context,
      wall,
      weatherBarrierCells,
      wallBaseIn,
      studDepth,
      project.walls.weatherBarrierMaterialId,
      weatherBarrierThickness,
      'weather',
      WALL_SHEATHING_THICKNESS,
      `${wall.id} wall WRB`,
    )
  }
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
    cladding.thicknessIn,
    'finish',
    WALL_SHEATHING_THICKNESS + weatherBarrierThickness,
    `${wall.id} wall siding`,
  )
  if (cladding.horizontalJoint.treatment === 'z-flashing') {
    addWallJointFlashing(
      context,
      wall,
      wallBaseIn,
      studDepth,
      claddingVerticalPanels,
      openings,
      cladding.thicknessIn,
      weatherBarrierThickness,
    )
  }
  if (cladding.openingHeadFlashing === 'z-flashing') {
    addOpeningHeadFlashing(
      context,
      wall,
      wallBaseIn,
      studDepth,
      openings,
      cladding.thicknessIn,
      weatherBarrierThickness,
    )
  }

  const envelopeHeight = height + floorEdgeDepth

  context.surfaces.push(
    {
      id: `${wall.id}-sheathing-area`,
      label: `${wall.id} wall sheathing`,
      assembly: 'walls',
      materialId: project.walls.sheathingMaterialId,
      areaSqIn: Math.max(0, sheathingSpan * envelopeHeight - openingArea),
      sourceSheetCount: sheathingCells.filter((cell) => cell.sourceKind === 'sheet').length,
    },
    {
      id: `${wall.id}-siding-area`,
      label: `${wall.id} wall siding`,
      assembly: 'walls',
      materialId: project.walls.sidingMaterialId,
      areaSqIn: Math.max(0, sidingSpan * envelopeHeight - openingArea),
      sourceSheetCount: sidingCells.filter((cell) => cell.sourceKind === 'sheet').length,
    },
  )
  if (cladding.requiresWeatherBarrier) {
    context.surfaces.push({
      id: `${wall.id}-weather-barrier-area`,
      label: `${wall.id} wall WRB`,
      assembly: 'walls',
      materialId: project.walls.weatherBarrierMaterialId,
      areaSqIn: Math.max(0, wall.surfaceSpanIn * envelopeHeight - openingArea),
    })
  }
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

function addExteriorCornerTrim(
  context: GeneratorContext,
  wallBaseIn: number,
  floorFrameBottomIn: number,
): void {
  const { widthIn, lengthIn, wallHeightIn } = context.project.dimensions
  const cladding = getPanelCladdingInstallation(context.project.walls.sidingMaterialId)
  const weatherBarrierThickness = cladding.requiresWeatherBarrier ? WEATHER_BARRIER_THICKNESS : 0
  const trimMaterial: MaterialId = 'exterior-1x4-trim'
  const [trimThickness, trimWidth] = lumberDimensions(trimMaterial)
  const exteriorLayerDepth =
    WALL_SHEATHING_THICKNESS + weatherBarrierThickness + cladding.thicknessIn
  const trimBottom = Math.max(
    floorFrameBottomIn,
    constructionRules.site.minimumUntreatedWoodClearanceIn,
  )
  const trimHeight = wallBaseIn + wallHeightIn - trimBottom
  const centerY = trimBottom + trimHeight / 2

  for (const xSide of [-1, 1] as const) {
    for (const zSide of [-1, 1] as const) {
      const endLabel = zSide === 1 ? 'front' : 'back'
      const sideLabel = xSide === 1 ? 'right' : 'left'
      addMember(context, {
        label: `${endLabel} ${sideLabel} corner trim`,
        assembly: 'walls',
        layer: 'finish',
        role: 'trim-flashing',
        scopeId: 'walls',
        scopeLabel: 'Shared wall details',
        materialId: trimMaterial,
        size: [trimWidth, trimHeight, trimThickness],
        position: [
          xSide * (widthIn / 2 + exteriorLayerDepth + trimThickness - trimWidth / 2),
          centerY,
          zSide * (lengthIn / 2 + exteriorLayerDepth + trimThickness / 2),
        ],
        cutLengthIn: trimHeight,
        idHint: 'corner-trim',
      })
      addMember(context, {
        label: `${sideLabel} ${endLabel} corner trim`,
        assembly: 'walls',
        layer: 'finish',
        role: 'trim-flashing',
        scopeId: 'walls',
        scopeLabel: 'Shared wall details',
        materialId: trimMaterial,
        size: [trimThickness, trimHeight, trimWidth],
        position: [
          xSide * (widthIn / 2 + exteriorLayerDepth + trimThickness / 2),
          centerY,
          zSide * (lengthIn / 2 + exteriorLayerDepth - trimWidth / 2),
        ],
        cutLengthIn: trimHeight,
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
    layer: 'sheathing' | 'weather' | 'finish'
    scopeId: string
    scopeLabel: string
    label: string
    idHint: string
    supportCentersIn: number[]
    panelWidthIn?: number
    panelHeightIn?: number
    courseJointGapIn?: number
    courseJointPlacement?: 'centered' | 'clearance-above'
    bottomClearanceIn?: number
    panelJointGapIn?: number
  },
): void {
  const panelWidthIn = options.panelWidthIn ?? PANEL_SHORT_EDGE
  const panelHeightIn = options.panelHeightIn ?? PANEL_LONG_EDGE
  const horizontalPanels = insetPanelJoints(
    supportAwarePanelSegments(options.spanIn, panelWidthIn, options.supportCentersIn, panelWidthIn),
    options.panelJointGapIn ?? PANEL_GAP,
  )
  const verticalPanels = insetPanelJoints(
    positivePanelSegments(options.riseIn, panelHeightIn),
    options.courseJointGapIn ?? PANEL_GAP,
    options.courseJointPlacement,
  ).map((panel, index) => ({
    ...panel,
    start: panel.start + (index === 0 ? (options.bottomClearanceIn ?? 0) : 0),
  }))
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
        label: `${options.label} ${options.layer === 'weather' ? 'section' : 'panel'} ${panelIndex}`,
        assembly: 'walls',
        layer: options.layer,
        scopeId: options.scopeId,
        scopeLabel: options.scopeLabel,
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

function addGableJointFlashing(
  context: GeneratorContext,
  wall: { id: 'front' | 'back'; fixedIn: number; outward: 1 | -1 },
  baseY: number,
  widthIn: number,
  riseIn: number,
  studDepth: number,
  jointHeightsIn: number[],
  claddingThicknessIn: number,
  weatherBarrierThicknessIn: number,
): void {
  const projection = constructionRules.flashing.projectionIn
  const visibleHeight = constructionRules.flashing.visibleHeightIn
  const fixedIn =
    wall.fixedIn +
    wall.outward *
      (studDepth / 2 +
        WALL_SHEATHING_THICKNESS +
        weatherBarrierThicknessIn +
        claddingThicknessIn +
        projection / 2)

  for (const height of jointHeightsIn) {
    const span = widthIn * (1 - height / riseIn)
    if (span <= 0.5) continue
    addMember(context, {
      label: `${wall.id} gable horizontal Z-flashing`,
      assembly: 'walls',
      layer: 'weather',
      role: 'trim-flashing',
      ...wallScope(wall.id),
      materialId: 'z-flashing',
      size: [span, visibleHeight, projection],
      position: [0, baseY + height, fixedIn],
      cutLengthIn: span,
      idHint: 'gable-z-flashing',
    })
  }
}

function addGableEndFraming(
  context: GeneratorContext,
  wallBaseIn: number,
  riseIn: number,
  roofTopY: (horizontalRunIn: number) => number,
  roofBottomY: (horizontalRunIn: number) => number,
  ridgeBottomY: number,
  ridgeFaceRunIn: number,
  roofAngleRad: number,
  roofAngleDeg: number,
  useDroppedRake: boolean,
): number {
  const { project } = context
  const { widthIn, lengthIn, wallHeightIn } = project.dimensions
  const studMaterial = project.walls.studSize as MaterialId
  const [, studDepth] = lumberDimensions(studMaterial)
  const cladding = getPanelCladdingInstallation(project.walls.sidingMaterialId)
  const weatherBarrierThickness = cladding.requiresWeatherBarrier ? WEATHER_BARRIER_THICKNESS : 0
  const baseY = wallBaseIn + wallHeightIn
  const gableAreaSqIn = widthIn * riseIn
  const framingPlane = lengthIn / 2 - studDepth / 2
  const roofCosine = Math.cos(roofAngleRad)
  const droppedTopPlateTopOffset = constructionRules.roof.outlookerDepthIn
  const droppedTopPlateBottomOffset = droppedTopPlateTopOffset + constructionRules.plateThicknessIn
  const gableLayoutPositions = edgeDatumMemberCenters(widthIn, widthIn, project.walls.spacingIn)
  const claddingPanelJoints = positivePanelSegments(riseIn, cladding.panelHeightIn)
    .slice(0, -1)
    .map((panel) => panel.end)
  if (!gableLayoutPositions.some((position) => Math.abs(position) < 0.01)) {
    gableLayoutPositions.push(0)
    gableLayoutPositions.sort((a, b) => a - b)
  }

  for (const wall of [
    { id: 'front' as const, fixedIn: framingPlane, outward: 1 as const },
    { id: 'back' as const, fixedIn: -framingPlane, outward: -1 as const },
  ]) {
    for (const x of gableLayoutPositions) {
      const left = x - PLATE_THICKNESS / 2
      const right = x + PLATE_THICKNESS / 2
      const centeredAtRidge = Math.abs(x) < 0.01
      const topLeft = centeredAtRidge
        ? ridgeBottomY
        : useDroppedRake
          ? roofTopY(Math.abs(left)) - droppedTopPlateBottomOffset / roofCosine
          : roofBottomY(Math.abs(left))
      const topRight = centeredAtRidge
        ? ridgeBottomY
        : useDroppedRake
          ? roofTopY(Math.abs(right)) - droppedTopPlateBottomOffset / roofCosine
          : roofBottomY(Math.abs(right))
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
        ...wallScope(wall.id),
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
                : useDroppedRake
                  ? 'Long point follows the underside of the dropped gable top plate.'
                  : 'Long point follows the underside of the gable rafter.',
            },
            { id: 'bottom-square', label: 'Bottom square cut', type: 'square' },
          ],
        },
      })
    }

    for (const side of useDroppedRake ? ([-1, 1] as const) : []) {
      const signed = (horizontalRunIn: number): number => side * horizontalRunIn
      const plateTop = (horizontalRunIn: number) =>
        roofTopY(horizontalRunIn) - droppedTopPlateTopOffset / roofCosine
      const plateBottom = (horizontalRunIn: number) =>
        roofTopY(horizontalRunIn) - droppedTopPlateBottomOffset / roofCosine
      const plateSlopeLength = Math.hypot(
        widthIn / 2 - ridgeFaceRunIn,
        (widthIn / 2 - ridgeFaceRunIn) * Math.tan(roofAngleRad),
      )

      addMember(context, {
        label: `${wall.id} ${side === -1 ? 'left' : 'right'} dropped gable top plate`,
        assembly: 'walls',
        layer: 'framing',
        ...wallScope(wall.id),
        materialId: studMaterial,
        ...profileGeometry(
          [
            [signed(ridgeFaceRunIn), plateBottom(ridgeFaceRunIn)],
            [signed(widthIn / 2), plateBottom(widthIn / 2)],
            [signed(widthIn / 2), plateTop(widthIn / 2)],
            [signed(ridgeFaceRunIn), plateTop(ridgeFaceRunIn)],
          ],
          studDepth,
          wall.fixedIn,
        ),
        cutLengthIn: plateSlopeLength,
        idHint: 'dropped-gable-top-plate',
        fabrication: {
          longPointLengthIn: plateSlopeLength,
          cuts: [
            {
              id: 'ridge-plumb',
              label: 'Ridge plumb cut',
              type: 'plumb',
              angleDeg: roofAngleDeg,
            },
            {
              id: 'eave-plumb',
              label: 'Eave plumb cut',
              type: 'plumb',
              angleDeg: roofAngleDeg,
            },
          ],
        },
      })
    }

    const gablePanelJoints = positivePanelSegments(riseIn, PANEL_LONG_EDGE)
      .slice(0, -1)
      .map((panel) => panel.end)
    for (const height of gablePanelJoints) {
      const halfWidth = (widthIn / 2) * (1 - height / riseIn)
      for (let index = 0; index < gableLayoutPositions.length - 1; index += 1) {
        const start = Math.max(gableLayoutPositions[index] + PLATE_THICKNESS / 2, -halfWidth)
        const end = Math.min(gableLayoutPositions[index + 1] - PLATE_THICKNESS / 2, halfWidth)
        if (end - start <= 0.5) continue
        addMember(context, {
          label: `${wall.id} gable sheathing joint blocking`,
          assembly: 'walls',
          layer: 'framing',
          ...wallScope(wall.id),
          materialId: studMaterial,
          size: [end - start, PLATE_THICKNESS, studDepth],
          position: [(start + end) / 2, baseY + height, wall.fixedIn],
          cutLengthIn: end - start,
          idHint: 'gable-panel-blocking',
        })
      }
    }

    addGableSurfaceLayer(context, {
      spanIn: widthIn,
      riseIn,
      baseY,
      fixedIn: wall.fixedIn + wall.outward * (studDepth / 2 + WALL_SHEATHING_THICKNESS / 2),
      thickness: WALL_SHEATHING_THICKNESS,
      materialId: project.walls.sheathingMaterialId,
      layer: 'sheathing',
      ...wallScope(wall.id),
      label: `${wall.id} gable sheathing`,
      idHint: 'gable-sheathing',
      supportCentersIn: gableLayoutPositions,
    })
    if (cladding.requiresWeatherBarrier) {
      addGableSurfaceLayer(context, {
        spanIn: widthIn,
        riseIn,
        baseY,
        fixedIn:
          wall.fixedIn +
          wall.outward * (studDepth / 2 + WALL_SHEATHING_THICKNESS + weatherBarrierThickness / 2),
        thickness: weatherBarrierThickness,
        materialId: project.walls.weatherBarrierMaterialId,
        layer: 'weather',
        ...wallScope(wall.id),
        label: `${wall.id} gable WRB`,
        idHint: 'gable-wrb',
        supportCentersIn: gableLayoutPositions,
        panelWidthIn: widthIn,
        panelHeightIn: riseIn,
        courseJointGapIn: 0,
      })
    }
    addGableSurfaceLayer(context, {
      spanIn: widthIn,
      riseIn,
      baseY,
      fixedIn:
        wall.fixedIn +
        wall.outward *
          (studDepth / 2 +
            WALL_SHEATHING_THICKNESS +
            weatherBarrierThickness +
            cladding.thicknessIn / 2),
      thickness: cladding.thicknessIn,
      materialId: project.walls.sidingMaterialId,
      layer: 'finish',
      ...wallScope(wall.id),
      label: `${wall.id} gable siding`,
      idHint: 'gable-siding',
      supportCentersIn: gableLayoutPositions,
      panelWidthIn: cladding.panelWidthIn,
      panelHeightIn: cladding.panelHeightIn,
      courseJointGapIn: cladding.horizontalJoint.clearanceAboveIn,
      courseJointPlacement: 'clearance-above',
      bottomClearanceIn: cladding.horizontalJoint.clearanceAboveIn,
      panelJointGapIn: cladding.verticalJointGapIn,
    })
    if (cladding.horizontalJoint.treatment === 'z-flashing') {
      addGableJointFlashing(
        context,
        wall,
        baseY,
        widthIn,
        riseIn,
        studDepth,
        [0, ...claddingPanelJoints],
        cladding.thicknessIn,
        weatherBarrierThickness,
      )
    }
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
  if (cladding.requiresWeatherBarrier) {
    context.surfaces.push({
      id: 'gable-weather-barrier-area',
      label: 'Gable end WRB',
      assembly: 'walls',
      materialId: project.walls.weatherBarrierMaterialId,
      areaSqIn: gableAreaSqIn,
    })
  }
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
  const roofCladding = getRoofCladdingInstallation(project.roof.roofingMaterialId)
  const roofPanelLength = roofSlopeLength + roofCladding.eavePanelOverhangIn
  const roofPanelSegments = centeredCoverageSegments(roofLength, roofCladding.panelCoverageWidthIn)

  const bearingRafterGeometry = (side: -1 | 1, fixedIn: number) => {
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

  const flyRafterGeometry = (side: -1 | 1, fixedIn: number) => {
    const signed = (horizontalRunIn: number): number => side * horizontalRunIn
    return profileGeometry(
      [
        [signed(ridgeFaceRun), bottomY(ridgeFaceRun)],
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

  const flyRafterFabrication: FabricationSpec = {
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
        id: 'tail-plumb',
        label: 'Tail plumb cut',
        type: 'plumb',
        angleDeg,
        note: 'Straight fly rafter forms the rake subfascia; it has no wall-bearing notch.',
      },
    ],
  }

  const gableAreaSqIn = addGableEndFraming(
    context,
    wallBaseIn,
    rise,
    topY,
    bottomY,
    ridgeBottomY,
    ridgeFaceRun,
    angle,
    angleDeg,
    overhang > 0,
  )
  const baseRafterPositions = edgeDatumMemberCenters(
    lengthIn,
    lengthIn,
    project.roof.spacingIn,
    rafterThickness,
  )
  const gableRafterCenter = (lengthIn - rafterThickness) / 2
  const anchorRafterCenter = Math.max(0, gableRafterCenter - project.roof.spacingIn)
  const structuralRafterPositions = (
    overhang > 0
      ? [
          ...baseRafterPositions.filter(
            (position) => Math.abs(position) < anchorRafterCenter - 0.01,
          ),
          -anchorRafterCenter,
          anchorRafterCenter,
        ]
      : baseRafterPositions
  )
    .filter(
      (position, index, positions) =>
        positions.findIndex((candidate) => Math.abs(candidate - position) < 0.01) === index,
    )
    .sort((a, b) => a - b)

  for (const z of structuralRafterPositions) {
    for (const side of [-1, 1] as const) {
      addMember(context, {
        label: `${side === -1 ? 'Left' : 'Right'} common rafter`,
        assembly: 'roof',
        layer: 'framing',
        ...roofSlopeScope(side),
        materialId: rafterMaterial,
        ...bearingRafterGeometry(side, z),
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

  const outlookerSlopeDistances: number[] = []
  for (
    let slopeDistance = constructionRules.roof.outlookerSpacingIn;
    slopeDistance < roofSlopeLength - PLATE_THICKNESS / 2;
    slopeDistance += constructionRules.roof.outlookerSpacingIn
  ) {
    outlookerSlopeDistances.push(slopeDistance)
  }

  if (overhang > 0) {
    const flyRafterOffset = roofLength / 2 - rafterThickness / 2
    const outlookerLength = Math.max(flyRafterOffset - anchorRafterCenter - rafterThickness, 0)
    const outlookerNormalOffset = rafterDepth / 2 - constructionRules.roof.outlookerDepthIn / 2

    for (const end of [-1, 1] as const) {
      for (const side of [-1, 1] as const) {
        const rotationZ = side === -1 ? angle : -angle
        addMember(context, {
          label: `${end === 1 ? 'Front' : 'Back'} ${side === -1 ? 'left' : 'right'} fly rafter`,
          assembly: 'roof',
          layer: 'framing',
          ...roofSlopeScope(side),
          materialId: rafterMaterial,
          ...flyRafterGeometry(side, end * flyRafterOffset),
          cutLengthIn: rafterLongPointLength,
          idHint: 'fly-rafter',
          fabrication: flyRafterFabrication,
        })

        for (const slopeDistance of outlookerLength > 0 ? outlookerSlopeDistances : []) {
          const horizontalRun = slopeDistance * cosine
          const centerlineX = side * horizontalRun
          const centerlineY = centerPeakY - horizontalRun * pitch
          addMember(context, {
            label: `${end === 1 ? 'Front' : 'Back'} rake lookout`,
            assembly: 'roof',
            layer: 'framing',
            ...roofSlopeScope(side),
            materialId: '2x4',
            size: [PLATE_THICKNESS, constructionRules.roof.outlookerDepthIn, outlookerLength],
            position: [
              centerlineX + side * Math.sin(angle) * outlookerNormalOffset,
              centerlineY + Math.cos(angle) * outlookerNormalOffset,
              (end * (anchorRafterCenter + flyRafterOffset)) / 2,
            ],
            rotation: [0, 0, rotationZ],
            cutLengthIn: outlookerLength,
            idHint: 'rake-lookout',
            fabrication: {
              longPointLengthIn: outlookerLength,
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

  for (const side of [-1, 1] as const) {
    addMember(context, {
      label: `${side === -1 ? 'Left' : 'Right'} eave subfascia`,
      assembly: 'roof',
      layer: 'framing',
      ...roofSlopeScope(side),
      materialId: rafterMaterial,
      size: [rafterThickness, rafterDepth, roofLength],
      position: [
        side * (extendedRun + rafterThickness / 2),
        topY(extendedRun) - rafterDepth / 2,
        0,
      ],
      cutLengthIn: roofLength,
      idHint: 'eave-subfascia',
    })
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

  const ridgeConnectionPositions: number[] = []
  let ridgePositionIndex = 0
  while (ridgePositionIndex < structuralRafterPositions.length) {
    ridgeConnectionPositions.push(structuralRafterPositions[ridgePositionIndex])
    if (ridgePositionIndex === structuralRafterPositions.length - 1) break
    let nextIndex = ridgePositionIndex + 1
    while (
      nextIndex + 1 < structuralRafterPositions.length &&
      structuralRafterPositions[nextIndex + 1] - structuralRafterPositions[ridgePositionIndex] <=
        constructionRules.roof.ridgeConnectionMaximumSpacingIn
    ) {
      nextIndex += 1
    }
    ridgePositionIndex = nextIndex
  }

  const strapSlopeLength = constructionRules.roof.ridgeStrapRunIn
  const strapHorizontalRun = strapSlopeLength * cosine
  const strapThickness = 1 / 16
  const strapTopAtRun = topY(strapHorizontalRun)
  const strapTopAtRidge = topY(ridgeFaceRun)
  const strapInsetX = Math.sin(angle) * strapThickness
  const strapInsetY = Math.cos(angle) * strapThickness
  for (const z of ridgeConnectionPositions) {
    addMember(context, {
      label: 'Rafter-pair ridge strap',
      assembly: 'roof',
      layer: 'framing',
      materialId: 'ridge-strap',
      ...profileGeometry(
        [
          [-strapHorizontalRun, strapTopAtRun],
          [-ridgeFaceRun, strapTopAtRidge],
          [ridgeFaceRun, strapTopAtRidge],
          [strapHorizontalRun, strapTopAtRun],
          [strapHorizontalRun - strapInsetX, strapTopAtRun - strapInsetY],
          [ridgeFaceRun - strapInsetX, strapTopAtRidge - strapInsetY],
          [-ridgeFaceRun + strapInsetX, strapTopAtRidge - strapInsetY],
          [-strapHorizontalRun + strapInsetX, strapTopAtRun - strapInsetY],
        ],
        1.25,
        z,
      ),
      cutLengthIn: strapSlopeLength * 2 + ridgeThickness,
      idHint: 'ridge-strap',
      fabrication: {
        longPointLengthIn: strapSlopeLength * 2 + ridgeThickness,
        cuts: [
          { id: 'left-square', label: 'Left square cut', type: 'square' },
          { id: 'right-square', label: 'Right square cut', type: 'square' },
        ],
      },
    })
  }

  const roofPanelSupportPositions = [...structuralRafterPositions]
  if (overhang > 0) {
    const flyRafterOffset = roofLength / 2 - rafterThickness / 2
    roofPanelSupportPositions.push(-flyRafterOffset, flyRafterOffset)
    roofPanelSupportPositions.sort((a, b) => a - b)
  }

  const roofPanelJoints = positivePanelSegments(roofSlopeLength, PANEL_SHORT_EDGE)
    .slice(0, -1)
    .map((panel) => panel.end)
  for (const side of [-1, 1] as const) {
    const rotationZ = side === -1 ? angle : -angle
    const blockingNormalOffset = rafterDepth / 2 - PLATE_THICKNESS / 2
    for (const slopeDistance of roofPanelJoints) {
      const horizontalRun = slopeDistance * cosine
      for (let index = 0; index < roofPanelSupportPositions.length - 1; index += 1) {
        const atRakeBay = index === 0 || index === roofPanelSupportPositions.length - 2
        const matchesOutlooker = outlookerSlopeDistances.some(
          (outlookerDistance) => Math.abs(outlookerDistance - slopeDistance) < 0.01,
        )
        if (atRakeBay && matchesOutlooker) continue
        const clearLength =
          roofPanelSupportPositions[index + 1] - roofPanelSupportPositions[index] - rafterThickness
        if (clearLength <= 0.5) continue
        addMember(context, {
          label: `${side === -1 ? 'Left' : 'Right'} roof sheathing joint blocking`,
          assembly: 'roof',
          layer: 'framing',
          ...roofSlopeScope(side),
          materialId: '2x4',
          size: [3.5, PLATE_THICKNESS, clearLength],
          position: [
            side * horizontalRun + side * Math.sin(angle) * blockingNormalOffset,
            centerPeakY - horizontalRun * pitch + Math.cos(angle) * blockingNormalOffset,
            (roofPanelSupportPositions[index] + roofPanelSupportPositions[index + 1]) / 2,
          ],
          rotation: [0, 0, rotationZ],
          cutLengthIn: clearLength,
          idHint: 'roof-panel-blocking',
        })
      }
    }
  }

  for (const side of [-1, 1] as const) {
    const rotationZ = side === -1 ? angle : -angle
    const sheathingOffset = rafterDepth / 2 + WALL_SHEATHING_THICKNESS / 2
    const roofDeckSurfaceOffset = rafterDepth / 2 + WALL_SHEATHING_THICKNESS
    const underlaymentOffset = roofDeckSurfaceOffset + WEATHER_BARRIER_THICKNESS / 2
    const roofingOffset =
      roofDeckSurfaceOffset + WEATHER_BARRIER_THICKNESS + roofCladding.visualBaseThicknessIn / 2
    const slopeCourses = insetPanelJoints(positivePanelSegments(roofSlopeLength, PANEL_SHORT_EDGE))
    let sheathingPanel = 0
    for (const [courseIndex, slope] of slopeCourses.entries()) {
      const lengthPanels = insetPanelJoints(
        supportAwarePanelSegments(
          roofLength,
          PANEL_LONG_EDGE,
          structuralRafterPositions,
          courseIndex % 2 === 0 ? PANEL_LONG_EDGE : PANEL_LONG_EDGE - 32,
        ),
      )
      for (const length of lengthPanels) {
        sheathingPanel += 1
        const slopeCenter = (slope.start + slope.end) / 2
        const horizontalRun = slopeCenter * cosine
        addMember(context, {
          label: `${side === -1 ? 'Left' : 'Right'} roof sheathing panel ${sheathingPanel}`,
          assembly: 'roof',
          layer: 'sheathing',
          ...roofSlopeScope(side),
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
      label: `${side === -1 ? 'Left' : 'Right'} roof underlayment`,
      assembly: 'roof',
      layer: 'weather',
      ...roofSlopeScope(side),
      materialId: 'synthetic-roof-underlayment',
      size: [roofSlopeLength, WEATHER_BARRIER_THICKNESS, roofLength],
      position: [
        (side * extendedRun) / 2 + side * Math.sin(angle) * underlaymentOffset,
        (centerTailY + centerPeakY) / 2 + Math.cos(angle) * underlaymentOffset,
        0,
      ],
      rotation: [0, 0, rotationZ],
      idHint: 'roof-underlayment',
    })

    const panelCenterSlopeDistance = roofPanelLength / 2
    const panelCenterHorizontalRun = panelCenterSlopeDistance * cosine
    for (const [panelIndex, panel] of roofPanelSegments.entries()) {
      addMember(context, {
        label: `${side === -1 ? 'Left' : 'Right'} metal roof panel ${panelIndex + 1}`,
        assembly: 'roof',
        layer: 'finish',
        ...roofSlopeScope(side),
        materialId: project.roof.roofingMaterialId,
        size: [roofPanelLength, roofCladding.visualBaseThicknessIn, panel.end - panel.start],
        position: [
          side * panelCenterHorizontalRun + side * Math.sin(angle) * roofingOffset,
          centerPeakY -
            panelCenterSlopeDistance * Math.sin(angle) +
            Math.cos(angle) * roofingOffset,
          (panel.start + panel.end) / 2,
        ],
        rotation: [0, 0, rotationZ],
        cutLengthIn: roofPanelLength,
        shape: 'ribbed-panel',
        ribbedPanel: {
          ribSpacingIn: roofCladding.majorRibSpacingIn,
          ribHeightIn: roofCladding.majorRibHeightIn,
          ribWidthIn: roofCladding.visualRibWidthIn,
        },
        idHint: 'metal-roof-panel',
      })
    }

    const eaveClosureSlopeDistance = roofSlopeLength - 1
    const eaveClosureHorizontalRun = eaveClosureSlopeDistance * cosine
    const closureOffset =
      roofDeckSurfaceOffset +
      WEATHER_BARRIER_THICKNESS +
      roofCladding.visualBaseThicknessIn +
      roofCladding.majorRibHeightIn / 2
    addMember(context, {
      label: `${side === -1 ? 'Left' : 'Right'} profiled eave closure`,
      assembly: 'roof',
      layer: 'finish',
      role: 'trim-flashing',
      ...roofSlopeScope(side),
      materialId: 'metal-eave-closure',
      size: [1, roofCladding.majorRibHeightIn, roofLength],
      position: [
        side * eaveClosureHorizontalRun + side * Math.sin(angle) * closureOffset,
        centerPeakY - eaveClosureSlopeDistance * Math.sin(angle) + Math.cos(angle) * closureOffset,
        0,
      ],
      rotation: [0, 0, rotationZ],
      cutLengthIn: roofLength,
      idHint: 'metal-eave-closure',
    })

    const ridgeClosureSlopeDistance = roofCladding.trimWingIn / 2
    const ridgeClosureHorizontalRun = ridgeClosureSlopeDistance * cosine
    addMember(context, {
      label: `${side === -1 ? 'Left' : 'Right'} profiled solid ridge closure`,
      assembly: 'roof',
      layer: 'finish',
      role: 'trim-flashing',
      ...roofSlopeScope(side),
      materialId: 'metal-ridge-closure',
      size: [2, roofCladding.majorRibHeightIn, roofLength],
      position: [
        side * ridgeClosureHorizontalRun + side * Math.sin(angle) * closureOffset,
        centerPeakY - ridgeClosureSlopeDistance * Math.sin(angle) + Math.cos(angle) * closureOffset,
        0,
      ],
      rotation: [0, 0, rotationZ],
      cutLengthIn: roofLength,
      idHint: 'metal-ridge-closure',
    })

    const trimOffset = closureOffset + roofCladding.majorRibHeightIn / 2 + 1 / 16
    addMember(context, {
      label: `${side === -1 ? 'Left' : 'Right'} eave/drip trim`,
      assembly: 'roof',
      layer: 'finish',
      role: 'trim-flashing',
      ...roofSlopeScope(side),
      materialId: 'metal-eave-trim',
      ...profileGeometry(
        (() => {
          const slopePoint = (slopeDistance: number, normalOffset: number): ProfilePoint => [
            side * slopeDistance * cosine + side * Math.sin(angle) * normalOffset,
            centerPeakY - slopeDistance * Math.sin(angle) + Math.cos(angle) * normalOffset,
          ]
          const innerTop = slopePoint(roofSlopeLength - 2, roofDeckSurfaceOffset + 1 / 16)
          const outerTop = slopePoint(roofSlopeLength + 1 / 4, roofDeckSurfaceOffset + 1 / 16)
          const innerBottom = slopePoint(roofSlopeLength - 2, roofDeckSurfaceOffset)
          return [
            innerTop,
            outerTop,
            [outerTop[0], outerTop[1] - 1.5],
            [outerTop[0] - (side * 1) / 4, outerTop[1] - 1.5],
            [outerTop[0] - (side * 1) / 4, outerTop[1] - 1 / 8],
            innerBottom,
          ]
        })(),
        roofLength + 2,
        0,
      ),
      cutLengthIn: roofLength + 2,
      idHint: 'metal-eave-trim',
    })

    for (const end of [-1, 1] as const) {
      addMember(context, {
        label: `${end === 1 ? 'Front' : 'Back'} ${side === -1 ? 'left' : 'right'} rake trim`,
        assembly: 'roof',
        layer: 'finish',
        role: 'trim-flashing',
        ...roofSlopeScope(side),
        materialId: 'metal-rake-trim',
        size: [roofPanelLength, 1 / 8, 2.5],
        position: [
          side * panelCenterHorizontalRun + side * Math.sin(angle) * trimOffset,
          centerPeakY - panelCenterSlopeDistance * Math.sin(angle) + Math.cos(angle) * trimOffset,
          end * (roofLength / 2 - 1.25),
        ],
        rotation: [0, 0, rotationZ],
        cutLengthIn: roofPanelLength,
        idHint: 'metal-rake-trim',
      })
    }
  }

  const ridgeSurfaceOffset =
    rafterDepth / 2 +
    WALL_SHEATHING_THICKNESS +
    WEATHER_BARRIER_THICKNESS +
    roofCladding.visualBaseThicknessIn +
    roofCladding.majorRibHeightIn
  const ridgePeakY = centerPeakY + ridgeSurfaceOffset / cosine + 1 / 4
  const ridgeWingHorizontalRun = roofCladding.trimWingIn * cosine
  const ridgeWingDrop = roofCladding.trimWingIn * Math.sin(angle)
  addMember(context, {
    label: 'Solid metal ridge cap',
    assembly: 'roof',
    layer: 'finish',
    role: 'trim-flashing',
    materialId: 'metal-ridge-cap',
    ...profileGeometry(
      [
        [-ridgeWingHorizontalRun, ridgePeakY - ridgeWingDrop],
        [0, ridgePeakY],
        [ridgeWingHorizontalRun, ridgePeakY - ridgeWingDrop],
        [ridgeWingHorizontalRun, ridgePeakY - ridgeWingDrop - 1 / 16],
        [0, ridgePeakY - 1 / 16],
        [-ridgeWingHorizontalRun, ridgePeakY - ridgeWingDrop - 1 / 16],
      ],
      roofLength + 2,
      0,
    ),
    cutLengthIn: roofLength + 2,
    idHint: 'metal-ridge-cap',
  })

  const roofAreaSqIn = 2 * roofSlopeLength * roofLength
  const metalPanelCount = roofPanelSegments.length * 2
  const edgePanelCoverage = roofPanelSegments[0].end - roofPanelSegments[0].start
  const edgePanelNote =
    Math.abs(edgePanelCoverage - roofCladding.panelCoverageWidthIn) < 0.01
      ? 'Full-width panels fit the roof length exactly.'
      : `The two edge panels on each slope are field-trimmed symmetrically to ${edgePanelCoverage.toFixed(2)} in coverage.`
  context.surfaces.push(
    {
      id: 'roof-sheathing-area',
      label: 'Roof sheathing area',
      assembly: 'roof',
      materialId: project.roof.sheathingMaterialId,
      areaSqIn: roofAreaSqIn,
    },
    {
      id: 'roof-underlayment-area',
      label: 'Roof underlayment area',
      assembly: 'roof',
      materialId: 'synthetic-roof-underlayment',
      areaSqIn: roofAreaSqIn,
    },
    {
      id: 'roofing-area',
      label: 'Laid-out 9–36 metal roof panels',
      assembly: 'roof',
      materialId: project.roof.roofingMaterialId,
      areaSqIn: roofAreaSqIn,
      exactPurchaseCount: metalPanelCount,
      purchaseLengthIn: roofPanelLength,
      purchaseNote: `${metalPanelCount} layout-derived panels at 36 in net coverage. ${edgePanelNote} Includes a 1 in eave extension; no blanket panel waste added.`,
    },
  )

  const peakHeightIn = ridgePeakY
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
  const { wallBaseIn, floorFrameBottomIn, floorAreaSqIn } = addFloor(context)
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
  let wallAreaSqIn = walls.reduce(
    (area, wall) => area + addWall(context, wall, wallBaseIn, floorFrameBottomIn),
    0,
  )
  addExteriorCornerTrim(context, wallBaseIn, floorFrameBottomIn)
  const { roofAreaSqIn, peakHeightIn, gableAreaSqIn } = addRoof(context, wallBaseIn)
  wallAreaSqIn += gableAreaSqIn
  const consumables = estimateFasteners(project, context.members, context.surfaces)
  const estimate = estimateMaterials(
    context.members,
    context.surfaces,
    project.wasteFactorPct,
    consumables,
  )

  return {
    members: context.members,
    surfaces: context.surfaces,
    consumables,
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
