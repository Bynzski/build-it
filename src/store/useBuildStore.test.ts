import { beforeEach, describe, expect, it } from 'vitest'
import { referenceDesign } from '../model/project'
import { useBuildStore } from './useBuildStore'

describe('BuildIt editor history', () => {
  beforeEach(() => {
    useBuildStore.getState().reset()
  })

  it('records, undoes, and redoes dimension changes', () => {
    const store = useBuildStore.getState()
    store.setDimension('widthIn', 120)
    expect(useBuildStore.getState().project.dimensions.widthIn).toBe(120)

    useBuildStore.getState().undo()
    expect(useBuildStore.getState().project.dimensions.widthIn).toBe(
      referenceDesign.dimensions.widthIn,
    )

    useBuildStore.getState().redo()
    expect(useBuildStore.getState().project.dimensions.widthIn).toBe(120)
  })

  it('adds and removes an opening as one operation each', () => {
    const initialCount = useBuildStore.getState().project.openings.length
    useBuildStore.getState().addOpening('window')
    const added = useBuildStore.getState().project.openings.at(-1)
    expect(added).toBeDefined()
    expect(useBuildStore.getState().project.openings).toHaveLength(initialCount + 1)

    useBuildStore.getState().removeOpening(added?.id ?? '')
    expect(useBuildStore.getState().project.openings).toHaveLength(initialCount)
  })
})
