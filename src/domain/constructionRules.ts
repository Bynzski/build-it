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
    sidingThicknessIn: 5 / 8,
    roofingThicknessIn: 1 / 8,
  },
  wallCorners: {
    sheathingLapOwner: 'side-walls',
    sidingClosure: 'corner-trim',
    trimWidthIn: 3.5,
    trimThicknessIn: 0.75,
  },
  plateThicknessIn: 1.5,
} as const

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
