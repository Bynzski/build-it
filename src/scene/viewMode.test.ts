import { describe, expect, it } from 'vitest'
import { memberPresentation, type ViewMode } from './viewMode'

describe('construction view modes', () => {
  it.each([
    ['framing', 'framing'],
    ['sheathing', 'sheathing'],
    ['exterior', 'finish'],
  ] as const)('maps %s mode to only the %s layer', (viewMode, visibleLayer) => {
    for (const layer of ['framing', 'sheathing', 'finish'] as const) {
      expect(memberPresentation(viewMode, layer).visible).toBe(layer === visibleLayer)
    }
  })

  it('shows every layer in x-ray view and ghosts the envelope', () => {
    const viewMode: ViewMode = 'xray'

    expect(memberPresentation(viewMode, 'framing')).toEqual({
      visible: true,
      transparent: false,
      opacity: 0.92,
    })
    expect(memberPresentation(viewMode, 'sheathing')).toEqual({
      visible: true,
      transparent: true,
      opacity: 0.12,
    })
    expect(memberPresentation(viewMode, 'finish')).toEqual({
      visible: true,
      transparent: true,
      opacity: 0.2,
    })
  })
})
