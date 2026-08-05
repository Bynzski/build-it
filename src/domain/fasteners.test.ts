import { describe, expect, it } from 'vitest'
import { cloneProject, referenceDesign } from '../model/project'
import { generateBuilding } from './generateBuilding'
import { getRoofCladdingInstallation } from './materials'

function requiredCount(building: ReturnType<typeof generateBuilding>, id: string): number {
  const quantity = building.consumables.find((item) => item.id === id)
  if (!quantity) throw new Error(`Missing consumable quantity ${id}`)
  return quantity.requiredCount
}

describe('fastener estimation', () => {
  it('uses the roofing profile allowance for panel screws', () => {
    const building = generateBuilding(referenceDesign)
    const profile = getRoofCladdingInstallation(referenceDesign.roof.roofingMaterialId)

    expect(requiredCount(building, 'metal-roof-panel-screws')).toBe(
      Math.ceil((building.metrics.roofAreaSqFt / 100) * profile.panelFastenersPerSquare),
    )
    expect(requiredCount(building, 'metal-roof-stitch-screws')).toBeGreaterThan(0)
    expect(requiredCount(building, 'metal-roof-trim-screws')).toBeGreaterThan(0)
  })

  it('recalculates framing, sheathing, siding, and roofing fasteners with dimensions', () => {
    const larger = cloneProject(referenceDesign)
    larger.dimensions.widthIn = 144
    larger.dimensions.lengthIn = 144
    const reference = generateBuilding(referenceDesign)
    const changed = generateBuilding(larger)

    for (const id of [
      'wall-stud-and-bottom-plate-nails',
      'wall-sheathing-nails',
      'panel-siding-nails',
      'roof-sheathing-nails',
      'metal-roof-panel-screws',
    ]) {
      expect(requiredCount(changed, id)).toBeGreaterThan(requiredCount(reference, id))
    }
  })

  it('adds drywall screws only with the drywall interior assembly', () => {
    const living = cloneProject(referenceDesign)
    living.walls.interiorMaterialId = 'drywall-1-2'

    expect(
      generateBuilding(referenceDesign).consumables.some(
        (quantity) => quantity.id === 'interior-drywall-screws',
      ),
    ).toBe(false)
    expect(requiredCount(generateBuilding(living), 'interior-drywall-screws')).toBeGreaterThan(0)
  })
})
