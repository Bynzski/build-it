import { create } from 'zustand'
import {
  type BuildItProject,
  cloneProject,
  type Opening,
  parseProject,
  referenceDesign,
} from '../model/project'
import type { ViewMode } from '../scene/viewMode'

export type { ViewMode } from '../scene/viewMode'

export interface LayerVisibility {
  foundation: boolean
  floor: boolean
  walls: boolean
  roof: boolean
}

interface BuildItStore {
  project: BuildItProject
  past: BuildItProject[]
  future: BuildItProject[]
  selectedMemberId: string | null
  selectedOpeningId: string | null
  viewMode: ViewMode
  layerVisibility: LayerVisibility
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
  setViewMode: (mode: ViewMode) => void
  toggleLayer: (layer: keyof LayerVisibility) => void
  undo: () => void
  redo: () => void
  reset: () => void
}

const MAX_HISTORY = 60

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
    viewMode: 'xray',
    layerVisibility: {
      foundation: true,
      floor: true,
      walls: true,
      roof: true,
    },
    commitProject: commit,
    replaceProject: (project) =>
      set({
        project: parseProject(project),
        past: [],
        future: [],
        selectedMemberId: null,
        selectedOpeningId: null,
      }),
    previewDimension: (field, value) =>
      set((state) => ({
        project: {
          ...state.project,
          dimensions: { ...state.project.dimensions, [field]: value },
        },
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
    setViewMode: (viewMode) => set({ viewMode, selectedMemberId: null }),
    toggleLayer: (layer) =>
      set((state) => ({
        layerVisibility: {
          ...state.layerVisibility,
          [layer]: !state.layerVisibility[layer],
        },
      })),
    undo: () => {
      const { past, project, future } = get()
      const previous = past.at(-1)
      if (!previous) return
      set({
        project: cloneProject(previous),
        past: past.slice(0, -1),
        future: [cloneProject(project), ...future].slice(0, MAX_HISTORY),
        selectedMemberId: null,
      })
    },
    redo: () => {
      const { past, project, future } = get()
      const next = future[0]
      if (!next) return
      set({
        project: cloneProject(next),
        past: [...past, cloneProject(project)].slice(-MAX_HISTORY),
        future: future.slice(1),
        selectedMemberId: null,
      })
    },
    reset: () =>
      set({
        project: cloneProject(referenceDesign),
        past: [],
        future: [],
        selectedMemberId: null,
        selectedOpeningId: null,
      }),
  }
})
