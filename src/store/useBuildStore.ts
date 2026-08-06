import { create } from 'zustand'
import type { AssemblyId, ConstructionRole } from '../domain/construction'
import {
  type BuildItProject,
  cloneProject,
  type Opening,
  parseProject,
  referenceDesign,
} from '../model/project'
import {
  defaultSectionView,
  type SavedView,
  type SavedVisibilityState,
  type SectionViewState,
  type SemanticVisibilityIsolation,
} from '../model/savedView'
import type { DisplayState, ViewPresetId, VisibilityIsolation } from '../scene/viewMode'

export type { DisplayState, ViewPresetId, VisibilityIsolation } from '../scene/viewMode'

interface BuildItStore {
  project: BuildItProject
  past: BuildItProject[]
  future: BuildItProject[]
  selectedMemberId: string | null
  selectedOpeningId: string | null
  viewPreset: ViewPresetId
  assemblyOverrides: Partial<Record<AssemblyId, DisplayState>>
  roleOverrides: Partial<Record<ConstructionRole, DisplayState>>
  scopeOverrides: Record<string, DisplayState>
  scopeRoleOverrides: Record<string, DisplayState>
  memberOverrides: Record<string, DisplayState>
  visibilityIsolation: VisibilityIsolation | null
  revealHidden: boolean
  sectionView: SectionViewState
  commitProject: (project: BuildItProject) => void
  replaceProject: (project: BuildItProject) => void
  previewDimension: (field: keyof BuildItProject['dimensions'], value: number) => void
  commitPreview: (original: BuildItProject) => void
  setDimension: (field: keyof BuildItProject['dimensions'], value: number) => void
  setName: (name: string) => void
  setWallOptions: (values: Partial<BuildItProject['walls']>) => void
  setFloorOptions: (values: Partial<BuildItProject['floor']>) => void
  setRoofOptions: (values: Partial<BuildItProject['roof']>) => void
  setFoundationOptions: (values: Partial<BuildItProject['foundation']>) => void
  setWasteFactor: (value: number) => void
  addOpening: (type: Opening['type']) => void
  updateOpening: (id: string, values: Partial<Opening>) => void
  removeOpening: (id: string) => void
  selectMember: (id: string | null) => void
  selectOpening: (id: string | null) => void
  setViewPreset: (preset: ViewPresetId) => void
  setAssemblyDisplay: (assembly: AssemblyId, state: DisplayState | null) => void
  setRoleDisplay: (role: ConstructionRole, state: DisplayState | null) => void
  setScopeDisplay: (scopeId: string, state: DisplayState | null) => void
  setScopeRoleDisplay: (scopeId: string, role: ConstructionRole, state: DisplayState | null) => void
  setMemberDisplay: (memberId: string, state: DisplayState | null) => void
  isolateVisibility: (isolation: VisibilityIsolation | null) => void
  resetVisibility: () => void
  showAll: () => void
  toggleRevealHidden: () => void
  setSectionView: (values: Partial<SectionViewState>) => void
  captureVisibility: () => SavedVisibilityState
  applySavedViewState: (view: SavedView) => void
  upsertSavedView: (view: SavedView) => void
  removeSavedView: (id: string) => void
  undo: () => void
  redo: () => void
  reset: () => void
}

const MAX_HISTORY = 60

function clearedVisibility(preset: ViewPresetId) {
  return {
    viewPreset: preset,
    assemblyOverrides: {},
    roleOverrides: {},
    scopeOverrides: {},
    scopeRoleOverrides: {},
    memberOverrides: {},
    visibilityIsolation: null,
    revealHidden: false,
  }
}

function sameProject(first: BuildItProject, second: BuildItProject): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

function nextOpeningId(type: Opening['type']): string {
  return `${type}-${Date.now().toString(36)}`
}

export const useBuildStore = create<BuildItStore>((set, get) => {
  const commit = (nextProject: BuildItProject): void => {
    const previous = get().project
    const next = parseProject(nextProject)
    if (sameProject(previous, next)) return
    set((state) => ({
      project: next,
      past: [...state.past, cloneProject(previous)].slice(-MAX_HISTORY),
      future: [],
      selectedMemberId: null,
      memberOverrides: {},
      visibilityIsolation:
        state.visibilityIsolation?.type === 'member' ? null : state.visibilityIsolation,
    }))
  }

  const update = (mutate: (draft: BuildItProject) => void): void => {
    const draft = cloneProject(get().project)
    mutate(draft)
    commit(draft)
  }

  return {
    project: cloneProject(referenceDesign),
    past: [],
    future: [],
    selectedMemberId: null,
    selectedOpeningId: null,
    ...clearedVisibility('xray'),
    sectionView: { ...defaultSectionView },
    commitProject: commit,
    replaceProject: (project) =>
      set({
        project: parseProject(project),
        past: [],
        future: [],
        selectedMemberId: null,
        selectedOpeningId: null,
        ...clearedVisibility('xray'),
        sectionView: { ...defaultSectionView },
      }),
    previewDimension: (field, value) =>
      set((state) => ({
        project: {
          ...state.project,
          dimensions: { ...state.project.dimensions, [field]: value },
        },
        selectedMemberId: null,
        memberOverrides: {},
        visibilityIsolation:
          state.visibilityIsolation?.type === 'member' ? null : state.visibilityIsolation,
      })),
    commitPreview: (original) => {
      const current = get().project
      if (sameProject(original, current)) return
      set((state) => ({
        past: [...state.past, cloneProject(original)].slice(-MAX_HISTORY),
        future: [],
      }))
    },
    setDimension: (field, value) =>
      update((draft) => {
        draft.dimensions[field] = value
      }),
    setName: (name) =>
      update((draft) => {
        draft.name = name
      }),
    setWallOptions: (values) =>
      update((draft) => {
        Object.assign(draft.walls, values)
      }),
    setFloorOptions: (values) =>
      update((draft) => {
        Object.assign(draft.floor, values)
      }),
    setRoofOptions: (values) =>
      update((draft) => {
        Object.assign(draft.roof, values)
      }),
    setFoundationOptions: (values) =>
      update((draft) => {
        Object.assign(draft.foundation, values)
      }),
    setWasteFactor: (value) =>
      update((draft) => {
        draft.wasteFactorPct = value
      }),
    addOpening: (type) => {
      const opening: Opening = {
        id: nextOpeningId(type),
        type,
        wall: 'front',
        centerOffsetIn: type === 'door' ? 0 : 24,
        widthIn: type === 'door' ? 36 : 24,
        heightIn: type === 'door' ? 80 : 36,
        sillHeightIn: type === 'door' ? 0 : 36,
      }
      update((draft) => {
        draft.openings.push(opening)
      })
      set({ selectedOpeningId: opening.id, selectedMemberId: null })
    },
    updateOpening: (id, values) =>
      update((draft) => {
        const opening = draft.openings.find((candidate) => candidate.id === id)
        if (opening) Object.assign(opening, values)
      }),
    removeOpening: (id) => {
      update((draft) => {
        draft.openings = draft.openings.filter((opening) => opening.id !== id)
      })
      set({ selectedOpeningId: null })
    },
    selectMember: (id) => set({ selectedMemberId: id, selectedOpeningId: null }),
    selectOpening: (id) => set({ selectedOpeningId: id, selectedMemberId: null }),
    setViewPreset: (viewPreset) =>
      set({ ...clearedVisibility(viewPreset), selectedMemberId: null }),
    setAssemblyDisplay: (assembly, displayState) =>
      set((state) => {
        const assemblyOverrides = { ...state.assemblyOverrides }
        if (displayState) assemblyOverrides[assembly] = displayState
        else delete assemblyOverrides[assembly]
        const scopeOverrides = Object.fromEntries(
          Object.entries(state.scopeOverrides).filter(
            ([scopeId]) => scopeId !== assembly && !scopeId.startsWith(`${assembly}:`),
          ),
        )
        const scopeRoleOverrides = Object.fromEntries(
          Object.entries(state.scopeRoleOverrides).filter(
            ([key]) => !key.startsWith(`${assembly}|`) && !key.startsWith(`${assembly}:`),
          ),
        )
        return {
          assemblyOverrides,
          scopeOverrides,
          scopeRoleOverrides,
          revealHidden: false,
        }
      }),
    setRoleDisplay: (role, displayState) =>
      set((state) => {
        const roleOverrides = { ...state.roleOverrides }
        if (displayState) roleOverrides[role] = displayState
        else delete roleOverrides[role]
        const scopeRoleOverrides = Object.fromEntries(
          Object.entries(state.scopeRoleOverrides).filter(([key]) => !key.endsWith(`|${role}`)),
        )
        return { roleOverrides, scopeRoleOverrides, revealHidden: false }
      }),
    setScopeDisplay: (scopeId, displayState) =>
      set((state) => {
        const scopeOverrides = { ...state.scopeOverrides }
        if (displayState) scopeOverrides[scopeId] = displayState
        else delete scopeOverrides[scopeId]
        const scopeRoleOverrides = Object.fromEntries(
          Object.entries(state.scopeRoleOverrides).filter(
            ([key]) => !key.startsWith(`${scopeId}|`),
          ),
        )
        return { scopeOverrides, scopeRoleOverrides, revealHidden: false }
      }),
    setScopeRoleDisplay: (scopeId, role, displayState) =>
      set((state) => {
        const key = `${scopeId}|${role}`
        const scopeRoleOverrides = { ...state.scopeRoleOverrides }
        if (displayState) scopeRoleOverrides[key] = displayState
        else delete scopeRoleOverrides[key]
        return { scopeRoleOverrides, revealHidden: false }
      }),
    setMemberDisplay: (memberId, displayState) =>
      set((state) => {
        const memberOverrides = { ...state.memberOverrides }
        if (displayState) memberOverrides[memberId] = displayState
        else delete memberOverrides[memberId]
        return { memberOverrides, revealHidden: false }
      }),
    isolateVisibility: (visibilityIsolation) => set({ visibilityIsolation, revealHidden: false }),
    resetVisibility: () =>
      set((state) => ({ ...clearedVisibility(state.viewPreset), selectedMemberId: null })),
    showAll: () => set({ ...clearedVisibility('complete'), selectedMemberId: null }),
    toggleRevealHidden: () => set((state) => ({ revealHidden: !state.revealHidden })),
    setSectionView: (values) =>
      set((state) => ({
        sectionView: {
          ...state.sectionView,
          ...values,
          offsetIn:
            values.offsetIn === undefined
              ? state.sectionView.offsetIn
              : Math.max(0, values.offsetIn),
        },
      })),
    captureVisibility: () => {
      const state = get()
      const isolation = state.visibilityIsolation
      const semanticIsolation: SemanticVisibilityIsolation | null =
        isolation && isolation.type !== 'member' ? isolation : null
      return {
        preset: state.viewPreset,
        assemblyOverrides: { ...state.assemblyOverrides },
        roleOverrides: { ...state.roleOverrides },
        scopeOverrides: { ...state.scopeOverrides },
        scopeRoleOverrides: { ...state.scopeRoleOverrides },
        isolation: semanticIsolation,
      }
    },
    applySavedViewState: (view) =>
      set({
        viewPreset: view.visibility.preset,
        assemblyOverrides: { ...view.visibility.assemblyOverrides },
        roleOverrides: { ...view.visibility.roleOverrides },
        scopeOverrides: { ...view.visibility.scopeOverrides },
        scopeRoleOverrides: { ...view.visibility.scopeRoleOverrides },
        memberOverrides: {},
        visibilityIsolation: view.visibility.isolation,
        revealHidden: false,
        sectionView: { ...view.section },
        selectedMemberId: null,
        selectedOpeningId: null,
      }),
    upsertSavedView: (view) =>
      update((draft) => {
        const index = draft.savedViews.findIndex((candidate) => candidate.id === view.id)
        if (index === -1) draft.savedViews.push(view)
        else draft.savedViews[index] = view
      }),
    removeSavedView: (id) =>
      update((draft) => {
        draft.savedViews = draft.savedViews.filter((view) => view.id !== id)
      }),
    undo: () => {
      const { past, project, future, visibilityIsolation } = get()
      const previous = past.at(-1)
      if (!previous) return
      set({
        project: cloneProject(previous),
        past: past.slice(0, -1),
        future: [cloneProject(project), ...future].slice(0, MAX_HISTORY),
        selectedMemberId: null,
        memberOverrides: {},
        visibilityIsolation: visibilityIsolation?.type === 'member' ? null : visibilityIsolation,
      })
    },
    redo: () => {
      const { past, project, future, visibilityIsolation } = get()
      const next = future[0]
      if (!next) return
      set({
        project: cloneProject(next),
        past: [...past, cloneProject(project)].slice(-MAX_HISTORY),
        future: future.slice(1),
        selectedMemberId: null,
        memberOverrides: {},
        visibilityIsolation: visibilityIsolation?.type === 'member' ? null : visibilityIsolation,
      })
    },
    reset: () =>
      set({
        project: cloneProject(referenceDesign),
        past: [],
        future: [],
        selectedMemberId: null,
        selectedOpeningId: null,
        ...clearedVisibility('xray'),
        sectionView: { ...defaultSectionView },
      }),
  }
})
