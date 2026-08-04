import * as THREE from 'three'
import { roundTo } from '../domain/units'

const AXIS_PROBE_IN = 48
const MIN_PROJECTED_AXIS_PX = 6

export interface ScreenAxisProjection {
  x: number
  y: number
  pixelsPerIn: number
}

export interface ScreenDragState {
  axis: ScreenAxisProjection
  lastClientX: number
  lastClientY: number
  rawValueIn: number
  dimensionScale: number
}

function screenPoint(point: THREE.Vector3, camera: THREE.Camera, width: number, height: number) {
  const projected = point.clone().project(camera)
  return {
    x: ((projected.x + 1) * width) / 2,
    y: ((1 - projected.y) * height) / 2,
  }
}

export function projectWorldAxisToScreen(
  camera: THREE.Camera,
  origin: THREE.Vector3,
  worldAxis: THREE.Vector3,
  viewportWidth: number,
  viewportHeight: number,
): ScreenAxisProjection {
  const start = screenPoint(origin, camera, viewportWidth, viewportHeight)
  const end = screenPoint(
    origin.clone().add(worldAxis.clone().normalize().multiplyScalar(AXIS_PROBE_IN)),
    camera,
    viewportWidth,
    viewportHeight,
  )
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const projectedLength = Math.hypot(deltaX, deltaY)

  if (projectedLength < MIN_PROJECTED_AXIS_PX) {
    const vertical = Math.abs(worldAxis.y) > 0.5
    return { x: vertical ? 0 : 1, y: vertical ? -1 : 0, pixelsPerIn: 1 }
  }

  return {
    x: deltaX / projectedLength,
    y: deltaY / projectedLength,
    pixelsPerIn: projectedLength / AXIS_PROBE_IN,
  }
}

export function updateScreenDrag(
  state: ScreenDragState,
  clientX: number,
  clientY: number,
  fine: boolean,
  minimumIn: number,
  maximumIn: number,
): number {
  const deltaX = clientX - state.lastClientX
  const deltaY = clientY - state.lastClientY
  const projectedPixels = deltaX * state.axis.x + deltaY * state.axis.y
  const sensitivity = fine ? 0.25 : 1
  const increment = fine ? 0.25 : 1
  const dimensionDelta =
    (projectedPixels / state.axis.pixelsPerIn) * state.dimensionScale * sensitivity

  state.lastClientX = clientX
  state.lastClientY = clientY
  state.rawValueIn = THREE.MathUtils.clamp(state.rawValueIn + dimensionDelta, minimumIn, maximumIn)
  return THREE.MathUtils.clamp(roundTo(state.rawValueIn, increment), minimumIn, maximumIn)
}
