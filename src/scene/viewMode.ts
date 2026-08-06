import type { AssemblyId, ConstructionMember, ConstructionRole } from '../domain/construction'
import type { DisplayState, SemanticVisibilityIsolation, ViewPresetId } from '../model/savedView'

export type { DisplayState, ViewPresetId } from '../model/savedView'

export type VisibilityIsolation = SemanticVisibilityIsolation | { type: 'member'; id: string }

export interface ViewVisibilitySettings {
  viewPreset: ViewPresetId
  assemblyOverrides: Partial<Record<AssemblyId, DisplayState>>
  roleOverrides: Partial<Record<ConstructionRole, DisplayState>>
  scopeOverrides: Record<string, DisplayState>
  scopeRoleOverrides: Record<string, DisplayState>
  memberOverrides: Record<string, DisplayState>
  isolation: VisibilityIsolation | null
  revealHidden: boolean
}

export interface MemberPresentation {
  state: DisplayState
  visible: boolean
  transparent: boolean
  opacity: number
  revealed: boolean
}

export function scopeRoleKey(scopeId: string, role: ConstructionRole): string {
  return `${scopeId}|${role}`
}

export function presetDisplayState(viewPreset: ViewPresetId, role: ConstructionRole): DisplayState {
  if (viewPreset === 'complete') return 'visible'
  if (viewPreset === 'framing') return role === 'structure' ? 'visible' : 'hidden'
  if (viewPreset === 'sheathing') {
    if (role === 'sheathing') return 'visible'
    return role === 'structure' ? 'ghosted' : 'hidden'
  }
  if (viewPreset === 'weather') {
    if (role === 'weatherproofing' || role === 'trim-flashing') return 'visible'
    return role === 'sheathing' ? 'ghosted' : 'hidden'
  }
  if (viewPreset === 'finished') {
    return role === 'exterior-finish' || role === 'trim-flashing' || role === 'opening'
      ? 'visible'
      : 'hidden'
  }
  return role === 'structure' ? 'visible' : 'ghosted'
}

export function isolationMatches(
  isolation: VisibilityIsolation,
  member: Pick<ConstructionMember, 'id' | 'assembly' | 'scopeId' | 'role'>,
): boolean {
  if (isolation.type === 'member') return member.id === isolation.id
  if (isolation.type === 'assembly') return member.assembly === isolation.id
  if (isolation.type === 'scope') return member.scopeId === isolation.id
  if (isolation.type === 'scope-role') {
    return scopeRoleKey(member.scopeId, member.role) === isolation.id
  }
  return member.role === isolation.id
}

function ghostOpacity(role: ConstructionRole): number {
  if (role === 'structure') return 0.3
  if (role === 'sheathing') return 0.14
  if (role === 'weatherproofing') return 0.12
  if (role === 'trim-flashing') return 0.22
  return 0.18
}

export function resolveMemberPresentation(
  member: ConstructionMember,
  settings: ViewVisibilitySettings,
): MemberPresentation {
  let state = presetDisplayState(settings.viewPreset, member.role)
  const roleOverride = settings.roleOverrides[member.role]
  if (roleOverride) state = roleOverride

  const assemblyOverride = settings.assemblyOverrides[member.assembly]
  if (assemblyOverride) state = assemblyOverride

  const scopeOverride = settings.scopeOverrides[member.scopeId]
  if (scopeOverride) state = scopeOverride

  const scopeRoleOverride = settings.scopeRoleOverrides[scopeRoleKey(member.scopeId, member.role)]
  if (scopeRoleOverride) state = scopeRoleOverride

  const memberOverride = settings.memberOverrides[member.id]
  if (memberOverride) state = memberOverride

  if (settings.isolation) {
    state = isolationMatches(settings.isolation, member) ? 'visible' : 'hidden'
  }

  const revealed = state === 'hidden' && settings.revealHidden
  const renderedState = revealed ? 'ghosted' : state
  const transparent = renderedState === 'ghosted'

  return {
    state,
    visible: renderedState !== 'hidden',
    transparent,
    opacity: transparent ? (revealed ? 0.14 : ghostOpacity(member.role)) : 0.92,
    revealed,
  }
}

export function nextDisplayState(state: DisplayState): DisplayState {
  if (state === 'visible') return 'ghosted'
  if (state === 'ghosted') return 'hidden'
  return 'visible'
}
