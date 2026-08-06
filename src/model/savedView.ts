import type { AssemblyId, ConstructionRole, Vector3Tuple } from '../domain/construction'

export type ViewPresetId = 'complete' | 'framing' | 'sheathing' | 'weather' | 'finished' | 'xray'
export type DisplayState = 'visible' | 'ghosted' | 'hidden'
export type SectionDirection = 'front' | 'back' | 'left' | 'right' | 'top'

export interface SemanticVisibilityIsolation {
  type: 'assembly' | 'scope' | 'scope-role' | 'role'
  id: string
}

export interface SavedVisibilityState {
  preset: ViewPresetId
  assemblyOverrides: Partial<Record<AssemblyId, DisplayState>>
  roleOverrides: Partial<Record<ConstructionRole, DisplayState>>
  scopeOverrides: Record<string, DisplayState>
  scopeRoleOverrides: Record<string, DisplayState>
  isolation: SemanticVisibilityIsolation | null
}

export interface SectionViewState {
  enabled: boolean
  direction: SectionDirection
  offsetIn: number
}

export interface CameraViewState {
  position: Vector3Tuple
  target: Vector3Tuple
}

export interface SavedView {
  id: string
  name: string
  camera: CameraViewState
  visibility: SavedVisibilityState
  section: SectionViewState
}

export const defaultSectionView: SectionViewState = {
  enabled: false,
  direction: 'front',
  offsetIn: 0,
}
