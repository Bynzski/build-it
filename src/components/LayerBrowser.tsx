import { useMemo } from 'react'
import type {
  AssemblyId,
  ConstructionMember,
  ConstructionRole,
  GeneratedBuilding,
} from '../domain/construction'
import {
  type DisplayState,
  nextDisplayState,
  resolveMemberPresentation,
  scopeRoleKey,
} from '../scene/viewMode'
import { useBuildStore } from '../store/useBuildStore'

type GroupDisplayState = DisplayState | 'mixed'

const assemblyOrder: AssemblyId[] = ['foundation', 'floor', 'walls', 'roof']
const assemblyLabels: Record<AssemblyId, string> = {
  foundation: 'Foundation',
  floor: 'Floor',
  walls: 'Exterior walls',
  roof: 'Roof',
}
const roleOrder: ConstructionRole[] = [
  'structure',
  'sheathing',
  'weatherproofing',
  'trim-flashing',
  'insulation',
  'exterior-finish',
  'interior-finish',
  'opening',
]
export const constructionRoleLabels: Record<ConstructionRole, string> = {
  structure: 'Structural framing',
  sheathing: 'Sheathing and deck',
  weatherproofing: 'Membranes',
  'trim-flashing': 'Trim and flashing',
  insulation: 'Insulation',
  'exterior-finish': 'Exterior finish',
  'interior-finish': 'Interior finish',
  opening: 'Doors and windows',
}

interface ScopeGroup {
  id: string
  label: string
  members: ConstructionMember[]
}

interface AssemblyGroup {
  id: AssemblyId
  label: string
  members: ConstructionMember[]
  scopes: ScopeGroup[]
}

function stateLabel(state: GroupDisplayState): string {
  if (state === 'visible') return 'Visible'
  if (state === 'ghosted') return 'Ghosted'
  if (state === 'hidden') return 'Hidden'
  return 'Mixed'
}

function stateGlyph(state: GroupDisplayState): string {
  if (state === 'visible') return '●'
  if (state === 'ghosted') return '◐'
  if (state === 'hidden') return '○'
  return '◒'
}

function nextGroupState(state: GroupDisplayState): DisplayState {
  return state === 'mixed' ? 'visible' : nextDisplayState(state)
}

function GroupControls({
  label,
  state,
  isolated,
  onCycle,
  onIsolate,
}: {
  label: string
  state: GroupDisplayState
  isolated: boolean
  onCycle: () => void
  onIsolate: () => void
}) {
  return (
    <span className="visibility-controls">
      <button
        type="button"
        className={`visibility-state state-${state}`}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onCycle()
        }}
        aria-label={`${label}: ${stateLabel(state)}. Change display state.`}
        title={`${stateLabel(state)} · click to cycle visible, ghosted, and hidden`}
      >
        {stateGlyph(state)}
      </button>
      <button
        type="button"
        className={`visibility-isolate${isolated ? ' is-active' : ''}`}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onIsolate()
        }}
        aria-label={`${isolated ? 'Stop isolating' : 'Isolate'} ${label}`}
        title={isolated ? 'Stop isolating' : 'Isolate this group'}
      >
        ◎
      </button>
    </span>
  )
}

export function LayerBrowser({
  building,
  onClose,
}: {
  building: GeneratedBuilding
  onClose: () => void
}) {
  const viewPreset = useBuildStore((state) => state.viewPreset)
  const assemblyOverrides = useBuildStore((state) => state.assemblyOverrides)
  const roleOverrides = useBuildStore((state) => state.roleOverrides)
  const scopeOverrides = useBuildStore((state) => state.scopeOverrides)
  const scopeRoleOverrides = useBuildStore((state) => state.scopeRoleOverrides)
  const memberOverrides = useBuildStore((state) => state.memberOverrides)
  const isolation = useBuildStore((state) => state.visibilityIsolation)
  const revealHidden = useBuildStore((state) => state.revealHidden)
  const setAssemblyDisplay = useBuildStore((state) => state.setAssemblyDisplay)
  const setRoleDisplay = useBuildStore((state) => state.setRoleDisplay)
  const setScopeDisplay = useBuildStore((state) => state.setScopeDisplay)
  const setScopeRoleDisplay = useBuildStore((state) => state.setScopeRoleDisplay)
  const isolateVisibility = useBuildStore((state) => state.isolateVisibility)
  const resetVisibility = useBuildStore((state) => state.resetVisibility)
  const showAll = useBuildStore((state) => state.showAll)
  const toggleRevealHidden = useBuildStore((state) => state.toggleRevealHidden)

  const settings = useMemo(
    () => ({
      viewPreset,
      assemblyOverrides,
      roleOverrides,
      scopeOverrides,
      scopeRoleOverrides,
      memberOverrides,
      isolation,
      revealHidden,
    }),
    [
      assemblyOverrides,
      isolation,
      memberOverrides,
      revealHidden,
      roleOverrides,
      scopeOverrides,
      scopeRoleOverrides,
      viewPreset,
    ],
  )

  const assemblyGroups = useMemo<AssemblyGroup[]>(() => {
    return assemblyOrder.map((assembly) => {
      const members = building.members.filter((member) => member.assembly === assembly)
      const scopesById = new Map<string, ScopeGroup>()
      for (const member of members) {
        const scope = scopesById.get(member.scopeId)
        if (scope) scope.members.push(member)
        else {
          scopesById.set(member.scopeId, {
            id: member.scopeId,
            label:
              member.scopeId === assembly && members.some((item) => item.scopeId !== assembly)
                ? 'Shared components'
                : member.scopeLabel,
            members: [member],
          })
        }
      }
      return {
        id: assembly,
        label: assemblyLabels[assembly],
        members,
        scopes: [...scopesById.values()],
      }
    })
  }, [building.members])

  const presentationState = (members: ConstructionMember[]): GroupDisplayState => {
    const states = new Set(
      members.map((member) => resolveMemberPresentation(member, settings).state),
    )
    return states.size === 1 ? ([...states][0] ?? 'hidden') : 'mixed'
  }

  const visibleRoles = roleOrder.filter((role) =>
    building.members.some((member) => member.role === role),
  )
  const isCustom =
    Object.keys(assemblyOverrides).length > 0 ||
    Object.keys(roleOverrides).length > 0 ||
    Object.keys(scopeOverrides).length > 0 ||
    Object.keys(scopeRoleOverrides).length > 0 ||
    Object.keys(memberOverrides).length > 0 ||
    isolation !== null

  return (
    <aside className="layer-browser" aria-label="Model visibility">
      <header className="layer-browser-header">
        <div>
          <span className="eyebrow">Model visibility</span>
          <h2>{isCustom ? 'Custom view' : 'Preset view'}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close layers">
          ×
        </button>
      </header>

      <div className="layer-browser-actions">
        <button type="button" onClick={showAll}>
          Show all
        </button>
        <button type="button" onClick={resetVisibility}>
          Reset preset
        </button>
        <button
          type="button"
          className={revealHidden ? 'is-active' : ''}
          onClick={toggleRevealHidden}
        >
          Reveal hidden
        </button>
      </div>

      {isolation ? (
        <div className="isolation-banner">
          <span>Isolation active</span>
          <button type="button" onClick={() => isolateVisibility(null)}>
            Show context
          </button>
        </div>
      ) : null}

      <div className="layer-browser-scroll">
        <section className="visibility-section">
          <h3>Construction layers</h3>
          <div className="visibility-rows">
            {visibleRoles.map((role) => {
              const members = building.members.filter((member) => member.role === role)
              const displayState = presentationState(members)
              const roleIsolated = isolation?.type === 'role' && isolation.id === role
              return (
                <div className="visibility-row" key={role}>
                  <span>
                    <strong>{constructionRoleLabels[role]}</strong>
                    <small>{members.length} parts</small>
                  </span>
                  <GroupControls
                    label={constructionRoleLabels[role]}
                    state={displayState}
                    isolated={roleIsolated}
                    onCycle={() => {
                      isolateVisibility(null)
                      setRoleDisplay(role, nextGroupState(displayState))
                    }}
                    onIsolate={() =>
                      isolateVisibility(roleIsolated ? null : { type: 'role', id: role })
                    }
                  />
                </div>
              )
            })}
          </div>
        </section>

        <section className="visibility-section">
          <h3>Building systems</h3>
          <div className="visibility-tree">
            {assemblyGroups.map((assembly) => {
              const displayState = presentationState(assembly.members)
              const assemblyIsolated =
                isolation?.type === 'assembly' && isolation.id === assembly.id
              return (
                <details key={assembly.id}>
                  <summary>
                    <span>
                      <strong>{assembly.label}</strong>
                      <small>{assembly.members.length} parts</small>
                    </span>
                    <GroupControls
                      label={assembly.label}
                      state={displayState}
                      isolated={assemblyIsolated}
                      onCycle={() => {
                        isolateVisibility(null)
                        setAssemblyDisplay(assembly.id, nextGroupState(displayState))
                      }}
                      onIsolate={() =>
                        isolateVisibility(
                          assemblyIsolated ? null : { type: 'assembly', id: assembly.id },
                        )
                      }
                    />
                  </summary>
                  <div className="visibility-branches">
                    {assembly.scopes.map((scope) => {
                      const scopeState = presentationState(scope.members)
                      const scopeIsolated = isolation?.type === 'scope' && isolation.id === scope.id
                      const scopeRoles = roleOrder.filter((role) =>
                        scope.members.some((member) => member.role === role),
                      )
                      return (
                        <details key={scope.id}>
                          <summary>
                            <span>
                              <strong>{scope.label}</strong>
                              <small>{scope.members.length} parts</small>
                            </span>
                            <GroupControls
                              label={scope.label}
                              state={scopeState}
                              isolated={scopeIsolated}
                              onCycle={() => {
                                isolateVisibility(null)
                                setScopeDisplay(scope.id, nextGroupState(scopeState))
                              }}
                              onIsolate={() =>
                                isolateVisibility(
                                  scopeIsolated ? null : { type: 'scope', id: scope.id },
                                )
                              }
                            />
                          </summary>
                          <div className="visibility-rows is-nested">
                            {scopeRoles.map((role) => {
                              const members = scope.members.filter((member) => member.role === role)
                              const roleState = presentationState(members)
                              const key = scopeRoleKey(scope.id, role)
                              const roleIsolated =
                                isolation?.type === 'scope-role' && isolation.id === key
                              return (
                                <div className="visibility-row" key={role}>
                                  <span>
                                    <strong>{constructionRoleLabels[role]}</strong>
                                    <small>{members.length} parts</small>
                                  </span>
                                  <GroupControls
                                    label={`${scope.label} ${constructionRoleLabels[role]}`}
                                    state={roleState}
                                    isolated={roleIsolated}
                                    onCycle={() => {
                                      isolateVisibility(null)
                                      setScopeRoleDisplay(scope.id, role, nextGroupState(roleState))
                                    }}
                                    onIsolate={() =>
                                      isolateVisibility(
                                        roleIsolated ? null : { type: 'scope-role', id: key },
                                      )
                                    }
                                  />
                                </div>
                              )
                            })}
                          </div>
                        </details>
                      )
                    })}
                  </div>
                </details>
              )
            })}
          </div>
        </section>
      </div>

      <footer>
        <span>{stateGlyph('visible')} visible</span>
        <span>{stateGlyph('ghosted')} ghosted</span>
        <span>{stateGlyph('hidden')} hidden</span>
        <span>◎ isolate</span>
      </footer>
    </aside>
  )
}
