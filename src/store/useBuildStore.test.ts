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

  it('switches construction presets and clears transient visibility changes', () => {
    useBuildStore.getState().selectMember('wall-stud-1')
    useBuildStore.getState().setMemberDisplay('wall-stud-1', 'hidden')
    useBuildStore.getState().isolateVisibility({ type: 'assembly', id: 'walls' })
    useBuildStore.getState().setViewPreset('sheathing')

    expect(useBuildStore.getState().viewPreset).toBe('sheathing')
    expect(useBuildStore.getState().selectedMemberId).toBeNull()
    expect(useBuildStore.getState().memberOverrides).toEqual({})
    expect(useBuildStore.getState().visibilityIsolation).toBeNull()
  })

  it('stores independent assembly, role, scope, and member display overrides', () => {
    const store = useBuildStore.getState()
    store.setAssemblyDisplay('roof', 'ghosted')
    store.setRoleDisplay('sheathing', 'hidden')
    store.setScopeDisplay('walls:front', 'ghosted')
    store.setScopeRoleDisplay('walls:front', 'structure', 'visible')
    store.setMemberDisplay('stud-1', 'hidden')

    const changed = useBuildStore.getState()
    expect(changed.assemblyOverrides.roof).toBe('ghosted')
    expect(changed.roleOverrides.sheathing).toBe('hidden')
    expect(changed.scopeOverrides['walls:front']).toBe('ghosted')
    expect(changed.scopeRoleOverrides['walls:front|structure']).toBe('visible')
    expect(changed.memberOverrides['stud-1']).toBe('hidden')
  })

  it('clears generated-member overrides when construction inputs change', () => {
    useBuildStore.getState().setMemberDisplay('stud-1', 'hidden')
    useBuildStore.getState().isolateVisibility({ type: 'member', id: 'stud-1' })
    useBuildStore.getState().setDimension('widthIn', 120)

    expect(useBuildStore.getState().memberOverrides).toEqual({})
    expect(useBuildStore.getState().visibilityIsolation).toBeNull()
  })

  it('stores and reapplies portable named-view state without member ids', () => {
    const store = useBuildStore.getState()
    store.setViewPreset('sheathing')
    store.setScopeDisplay('walls:front', 'hidden')
    store.setMemberDisplay('generated-stud-1', 'hidden')
    store.isolateVisibility({ type: 'member', id: 'generated-stud-1' })
    store.setSectionView({ enabled: true, direction: 'front', offsetIn: 24 })

    const view = {
      id: 'front-section',
      name: 'Front section',
      camera: {
        position: [0, 80, 300] as [number, number, number],
        target: [0, 70, 0] as [number, number, number],
      },
      visibility: store.captureVisibility(),
      section: useBuildStore.getState().sectionView,
    }
    store.upsertSavedView(view)

    expect(useBuildStore.getState().project.savedViews[0].visibility.isolation).toBeNull()
    expect(JSON.stringify(useBuildStore.getState().project.savedViews[0])).not.toContain(
      'generated-stud-1',
    )

    useBuildStore.getState().setViewPreset('complete')
    useBuildStore.getState().setSectionView({ enabled: false })
    useBuildStore.getState().applySavedViewState(view)

    const restored = useBuildStore.getState()
    expect(restored.viewPreset).toBe('sheathing')
    expect(restored.scopeOverrides['walls:front']).toBe('hidden')
    expect(restored.sectionView).toEqual({ enabled: true, direction: 'front', offsetIn: 24 })
  })
})
