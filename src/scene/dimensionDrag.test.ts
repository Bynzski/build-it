import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { projectWorldAxisToScreen, type ScreenDragState, updateScreenDrag } from './dimensionDrag'

describe('dimension drag projection', () => {
  it('projects a world axis into a normalized screen direction', () => {
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 1, 1200)
    camera.position.set(190, 155, 215)
    camera.lookAt(0, 60, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    const projection = projectWorldAxisToScreen(
      camera,
      new THREE.Vector3(57, 20, 0),
      new THREE.Vector3(1, 0, 0),
      1050,
      900,
    )

    expect(Math.hypot(projection.x, projection.y)).toBeCloseTo(1)
    expect(projection.pixelsPerIn).toBeGreaterThan(0.5)
  })

  it('updates only from movement along the visible handle axis', () => {
    const state: ScreenDragState = {
      axis: { x: 1, y: 0, pixelsPerIn: 2 },
      lastClientX: 100,
      lastClientY: 100,
      rawValueIn: 96,
      dimensionScale: 2,
    }

    expect(updateScreenDrag(state, 110, 140, false, 72, 288)).toBe(106)
    expect(updateScreenDrag(state, 110, 180, false, 72, 288)).toBe(106)
  })

  it('uses reduced sensitivity and quarter-inch snapping in fine mode', () => {
    const state: ScreenDragState = {
      axis: { x: 1, y: 0, pixelsPerIn: 1 },
      lastClientX: 0,
      lastClientY: 0,
      rawValueIn: 96,
      dimensionScale: 1,
    }

    expect(updateScreenDrag(state, 3, 0, true, 72, 144)).toBe(96.75)
    expect(updateScreenDrag(state, 103, 0, false, 72, 100)).toBe(100)
  })
})
