import { describe, expect, it } from 'vitest'
import { cameraFitForBuilding } from './cameraFit'

describe('camera fit', () => {
  it('frames the reference shed around its vertical center', () => {
    const fit = cameraFitForBuilding(96, 120, 150, 12)

    expect(fit.target).toEqual([0, 72, 0])
    expect(fit.distance).toBeGreaterThan(250)
    expect(fit.position[0]).toBeGreaterThan(0)
    expect(fit.position[2]).toBeGreaterThan(0)
  })

  it('backs the camera away for a larger design', () => {
    const reference = cameraFitForBuilding(96, 120, 150, 12)
    const longCabin = cameraFitForBuilding(192, 480, 180, 18)

    expect(longCabin.distance).toBeGreaterThan(reference.distance * 2)
  })
})
