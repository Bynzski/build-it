import { describe, expect, it } from 'vitest'
import { cloneProject, parseProject, projectSchema, referenceDesign } from './project'

describe('BuildIt project schema', () => {
  it('loads the committed 8×10 reference project', () => {
    expect(referenceDesign.schemaVersion).toBe(1)
    expect(referenceDesign.dimensions).toEqual({
      widthIn: 96,
      lengthIn: 120,
      wallHeightIn: 97.125,
    })
    expect(referenceDesign.openings).toHaveLength(2)
  })

  it('round-trips a project through JSON and schema validation', () => {
    const serialized = JSON.stringify(referenceDesign)
    expect(parseProject(JSON.parse(serialized))).toEqual(referenceDesign)
  })

  it('adds the default WRB when opening an older schema-version-1 project', () => {
    const legacy = JSON.parse(JSON.stringify(referenceDesign))
    delete legacy.walls.weatherBarrierMaterialId

    expect(parseProject(legacy).walls.weatherBarrierMaterialId).toBe('housewrap-wrb')
  })

  it('clones without sharing nested state', () => {
    const clone = cloneProject(referenceDesign)
    clone.dimensions.widthIn = 144
    expect(referenceDesign.dimensions.widthIn).toBe(96)
  })

  it('rejects an unsupported schema version', () => {
    expect(() => projectSchema.parse({ ...referenceDesign, schemaVersion: 2 })).toThrow()
  })
})
