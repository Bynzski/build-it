import type { Vector3Tuple } from '../domain/construction'
import type { CameraViewState, SectionDirection, SectionViewState } from '../model/savedView'
import { cameraFitForBuilding } from './cameraFit'

export type StandardCameraDirection = SectionDirection | 'perspective'

export function cameraViewForBuilding(
  direction: StandardCameraDirection,
  widthIn: number,
  lengthIn: number,
  peakHeightIn: number,
  overhangIn: number,
): CameraViewState {
  const fit = cameraFitForBuilding(widthIn, lengthIn, peakHeightIn, overhangIn)
  if (direction === 'perspective') return { position: fit.position, target: fit.target }

  const vectors: Record<Exclude<StandardCameraDirection, 'perspective'>, Vector3Tuple> = {
    front: [0, 0, 1],
    back: [0, 0, -1],
    left: [-1, 0, 0],
    right: [1, 0, 0],
    top: [0, 1, 0.0001],
  }
  const vector = vectors[direction]
  return {
    target: fit.target,
    position: [
      fit.target[0] + vector[0] * fit.distance,
      fit.target[1] + vector[1] * fit.distance,
      fit.target[2] + vector[2] * fit.distance,
    ],
  }
}

export interface SectionPlaneDefinition {
  normal: Vector3Tuple
  constant: number
}

export function sectionDepthLimit(
  section: Pick<SectionViewState, 'direction'>,
  widthIn: number,
  lengthIn: number,
  peakHeightIn: number,
): number {
  if (section.direction === 'front' || section.direction === 'back') return lengthIn
  if (section.direction === 'left' || section.direction === 'right') return widthIn
  return peakHeightIn
}

export function sectionPlaneDefinition(
  section: SectionViewState,
  widthIn: number,
  lengthIn: number,
  peakHeightIn: number,
): SectionPlaneDefinition | null {
  if (!section.enabled) return null
  const depth = Math.min(
    sectionDepthLimit(section, widthIn, lengthIn, peakHeightIn),
    Math.max(0, section.offsetIn),
  )
  if (section.direction === 'front') return { normal: [0, 0, -1], constant: lengthIn / 2 - depth }
  if (section.direction === 'back') return { normal: [0, 0, 1], constant: lengthIn / 2 - depth }
  if (section.direction === 'left') return { normal: [1, 0, 0], constant: widthIn / 2 - depth }
  if (section.direction === 'right') return { normal: [-1, 0, 0], constant: widthIn / 2 - depth }
  return { normal: [0, -1, 0], constant: peakHeightIn - depth }
}
