import type { MemberLayer } from '../domain/construction'

export type ViewMode = 'framing' | 'sheathing' | 'weather' | 'exterior' | 'xray'

export interface MemberPresentation {
  visible: boolean
  transparent: boolean
  opacity: number
}

export function memberPresentation(viewMode: ViewMode, layer: MemberLayer): MemberPresentation {
  const visible =
    viewMode === 'xray' ||
    (viewMode === 'framing' && layer === 'framing') ||
    (viewMode === 'sheathing' && layer === 'sheathing') ||
    (viewMode === 'weather' && layer === 'weather') ||
    (viewMode === 'exterior' && (layer === 'weather' || layer === 'finish'))
  const transparent = viewMode === 'xray' && layer !== 'framing'

  return {
    visible,
    transparent,
    opacity: transparent ? (layer === 'finish' ? 0.2 : layer === 'weather' ? 0.16 : 0.12) : 0.92,
  }
}
