import type { Vector3Tuple } from '../domain/construction'

const FIT_DIRECTION: Vector3Tuple = [0.58, 0.42, 0.66]

export interface CameraFit {
  position: Vector3Tuple
  target: Vector3Tuple
  distance: number
}

export function cameraFitForBuilding(
  widthIn: number,
  lengthIn: number,
  peakHeightIn: number,
  overhangIn: number,
  verticalFovDeg = 42,
): CameraFit {
  const outerWidth = widthIn + overhangIn * 2
  const outerLength = lengthIn + overhangIn * 2
  const horizontalRadius = Math.hypot(outerWidth, outerLength) / 2
  const boundingRadius = Math.hypot(horizontalRadius, peakHeightIn / 2)
  const halfFov = (verticalFovDeg * Math.PI) / 360
  const distance = Math.max(220, (boundingRadius / Math.tan(halfFov)) * 1.12)
  const directionLength = Math.hypot(...FIT_DIRECTION)
  const direction = FIT_DIRECTION.map((value) => value / directionLength) as Vector3Tuple
  const target: Vector3Tuple = [0, peakHeightIn * 0.48, 0]

  return {
    target,
    distance,
    position: [
      target[0] + direction[0] * distance,
      target[1] + direction[1] * distance,
      target[2] + direction[2] * distance,
    ],
  }
}
