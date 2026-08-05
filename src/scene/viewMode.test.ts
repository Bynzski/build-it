import { describe, expect, it } from 'vitest'
import type { ConstructionMember, ConstructionRole } from '../domain/construction'
import {
  nextDisplayState,
  presetDisplayState,
  resolveMemberPresentation,
  type ViewVisibilitySettings,
} from './viewMode'

function member(
  role: ConstructionRole,
  values: Partial<Pick<ConstructionMember, 'id' | 'assembly' | 'scopeId'>> = {},
): ConstructionMember {
  return {
    id: values.id ?? `${role}-1`,
    label: role,
    assembly: values.assembly ?? 'walls',
    layer:
      role === 'structure'
        ? 'framing'
        : role === 'sheathing'
          ? 'sheathing'
          : role === 'weatherproofing' || role === 'trim-flashing'
            ? 'weather'
            : 'finish',
    role,
    scopeId: values.scopeId ?? 'walls:front',
    scopeLabel: 'Front wall',
    kind: role,
    materialId: '2x4',
    size: [1, 1, 1],
    position: [0, 0, 0],
  }
}

function settings(values: Partial<ViewVisibilitySettings> = {}): ViewVisibilitySettings {
  return {
    viewPreset: 'complete',
    assemblyOverrides: {},
    roleOverrides: {},
    scopeOverrides: {},
    scopeRoleOverrides: {},
    memberOverrides: {},
    isolation: null,
    revealHidden: false,
    ...values,
  }
}

describe('construction view presets', () => {
  it('shows every modeled role in the complete preset', () => {
    for (const role of [
      'structure',
      'sheathing',
      'weatherproofing',
      'trim-flashing',
      'exterior-finish',
      'interior-finish',
    ] as const) {
      expect(presetDisplayState('complete', role)).toBe('visible')
    }
  })

  it('keeps supporting framing ghosted behind sheathing', () => {
    expect(presetDisplayState('sheathing', 'sheathing')).toBe('visible')
    expect(presetDisplayState('sheathing', 'structure')).toBe('ghosted')
    expect(presetDisplayState('sheathing', 'exterior-finish')).toBe('hidden')
  })

  it('makes Finished an exterior-only view and X-ray a complete contextual view', () => {
    expect(presetDisplayState('finished', 'exterior-finish')).toBe('visible')
    expect(presetDisplayState('finished', 'trim-flashing')).toBe('visible')
    expect(presetDisplayState('finished', 'weatherproofing')).toBe('hidden')
    expect(presetDisplayState('xray', 'structure')).toBe('visible')
    expect(presetDisplayState('xray', 'sheathing')).toBe('ghosted')
  })

  it('resolves category, scope-role, member, and isolation overrides deterministically', () => {
    const stud = member('structure', { id: 'stud-1', scopeId: 'walls:front' })
    const overridden = resolveMemberPresentation(
      stud,
      settings({
        roleOverrides: { structure: 'hidden' },
        scopeRoleOverrides: { 'walls:front|structure': 'ghosted' },
        memberOverrides: { 'stud-1': 'visible' },
      }),
    )
    expect(overridden.state).toBe('visible')

    const isolated = resolveMemberPresentation(
      stud,
      settings({ isolation: { type: 'assembly', id: 'roof' } }),
    )
    expect(isolated.visible).toBe(false)
  })

  it('allows a mixed preset assembly to be forced fully visible', () => {
    const roofSheathing = member('sheathing', { assembly: 'roof', scopeId: 'roof:left' })
    const preset = resolveMemberPresentation(roofSheathing, settings({ viewPreset: 'xray' }))
    const forced = resolveMemberPresentation(
      roofSheathing,
      settings({ viewPreset: 'xray', assemblyOverrides: { roof: 'visible' } }),
    )

    expect(preset.state).toBe('ghosted')
    expect(forced.state).toBe('visible')
  })

  it('reveals hidden members as a temporary highlighted ghost', () => {
    const presentation = resolveMemberPresentation(
      member('structure'),
      settings({ viewPreset: 'finished', revealHidden: true }),
    )

    expect(presentation.state).toBe('hidden')
    expect(presentation.visible).toBe(true)
    expect(presentation.transparent).toBe(true)
    expect(presentation.revealed).toBe(true)
  })

  it('cycles through visible, ghosted, and hidden states', () => {
    expect(nextDisplayState('visible')).toBe('ghosted')
    expect(nextDisplayState('ghosted')).toBe('hidden')
    expect(nextDisplayState('hidden')).toBe('visible')
  })
})
