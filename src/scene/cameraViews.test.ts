import { describe, expect, it } from 'vitest'
import { cameraViewForBuilding, sectionPlaneDefinition } from './cameraViews'

describe('standard camera views', () => {
  it('places the front camera on the positive length axis', () => {
    const view = cameraViewForBuilding('front', 96, 120, 150, 12)
    expect(view.position[0]).toBe(0)
    expect(view.position[2]).toBeGreaterThan(view.target[2])
  })

  it('keeps the perspective view off all three primary axes', () => {
    const view = cameraViewForBuilding('perspective', 96, 120, 150, 12)
    expect(view.position.every((value, index) => value !== view.target[index])).toBe(true)
  })
})

describe('section planes', () => {
  it('moves a front cut inward from the front face', () => {
    expect(
      sectionPlaneDefinition({ enabled: true, direction: 'front', offsetIn: 24 }, 96, 120, 150),
    ).toEqual({ normal: [0, 0, -1], constant: 36 })
  })

  it('clamps cut depth to the building extent', () => {
    expect(
      sectionPlaneDefinition({ enabled: true, direction: 'right', offsetIn: 200 }, 96, 120, 150),
    ).toEqual({ normal: [-1, 0, 0], constant: -48 })
  })
})
