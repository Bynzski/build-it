import type { WallId } from '../model/project'

export const constructionRules = {
  dimensionReference: 'outside-framing',
  panels: {
    shortEdgeIn: 48,
    longEdgeIn: 96,
    jointGapIn: 1 / 8,
  },
  layers: {
    subfloorThicknessIn: 23 / 32,
    wallSheathingThicknessIn: 7 / 16,
    weatherBarrierThicknessIn: 1 / 32,
    roofingThicknessIn: 1 / 8,
  },
  wallCorners: {
    sheathingLapOwner: 'side-walls',
    sidingClosure: 'corner-trim',
    trimWidthIn: 3.5,
    trimThicknessIn: 0.75,
  },
  plateThicknessIn: 1.5,
  walls: {
    standardEightFootStudIn: 92 + 5 / 8,
    precutStudLengthsIn: [92 + 5 / 8, 104 + 5 / 8, 116 + 5 / 8],
    panelEdgeFastenerSetbackIn: 3 / 8,
    maximumReusableClosureStripIn: 12,
    rimCoverage: 'clearance-limited',
  },
  flashing: {
    projectionIn: 3 / 4,
    visibleHeightIn: 1 / 8,
    openingEndExtensionIn: 3.5,
  },
  roof: {
    ladderRakeMaximumOverhangIn: 9,
    cantileveredRakeMaximumOverhangIn: 24,
    outlookerSpacingIn: 16,
    outlookerDepthIn: 3.5,
    ridgeConnectionMaximumSpacingIn: 48,
    ridgeStrapRunIn: 12,
  },
  site: {
    minimumUntreatedWoodClearanceIn: 6,
  },
} as const

export const standardEightFootWallHeightIn =
  constructionRules.walls.standardEightFootStudIn + constructionRules.plateThicknessIn * 3

export function wallPanelLayoutSpan(
  wallId: WallId,
  framingSurfaceSpanIn: number,
  layer: 'sheathing' | 'siding',
): number {
  if (layer === 'sheathing' && (wallId === 'left' || wallId === 'right')) {
    return framingSurfaceSpanIn + constructionRules.layers.wallSheathingThicknessIn * 2
  }
  return framingSurfaceSpanIn
}
