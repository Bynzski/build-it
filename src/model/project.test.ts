import { describe, expect, it } from 'vitest'
import { cloneProject, parseProject, referenceDesign } from './project'

describe('BuildIt project schema', () => {
  it('loads the committed 8×10 reference project', () => {
    expect(referenceDesign.schemaVersion).toBe(2)
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

  it('migrates a schema-version-1 project and adds its default fields', () => {
    const legacy = JSON.parse(JSON.stringify(referenceDesign))
    legacy.schemaVersion = 1
    delete legacy.savedViews
    delete legacy.walls.weatherBarrierMaterialId

    expect(parseProject(legacy).walls.weatherBarrierMaterialId).toBe('housewrap-wrb')
    expect(parseProject(legacy).schemaVersion).toBe(2)
    expect(parseProject(legacy).savedViews).toEqual([])
  })

  it('clones without sharing nested state', () => {
    const clone = cloneProject(referenceDesign)
    clone.dimensions.widthIn = 144
    expect(referenceDesign.dimensions.widthIn).toBe(96)
  })

  it('rejects an unsupported schema version', () => {
    expect(() => parseProject({ ...referenceDesign, schemaVersion: 3 })).toThrow()
  })
})
