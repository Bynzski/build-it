import type { BuildItProject, Opening, WallId } from '../model/project'
import type { GuidanceItem } from './construction'
import { formatFeetInches } from './units'

function panelSuggestion(
  field: 'widthIn' | 'lengthIn' | 'wallHeightIn',
  label: string,
  value: number,
): GuidanceItem | undefined {
  const nearest = Math.round(value / 48) * 48
  const difference = nearest - value
  if (difference === 0 || Math.abs(difference) > 12 || nearest < 72) return undefined

  return {
    id: `panel-fit-${field}`,
    level: 'suggestion',
    title: `${label} is near a sheet boundary`,
    message: `Changing ${label.toLowerCase()} from ${formatFeetInches(value)} to ${formatFeetInches(nearest)} aligns it with 4×8 sheet goods and may reduce offcuts.`,
    field,
    suggestedValueIn: nearest,
  }
}

function wallSpan(project: BuildItProject, wall: WallId): number {
  return wall === 'front' || wall === 'back'
    ? project.dimensions.widthIn
    : project.dimensions.lengthIn
}

function openingBounds(opening: Opening): [number, number] {
  return [
    opening.centerOffsetIn - opening.widthIn / 2,
    opening.centerOffsetIn + opening.widthIn / 2,
  ]
}

export function getGuidance(project: BuildItProject): GuidanceItem[] {
  const items: GuidanceItem[] = []
  const { widthIn, lengthIn, wallHeightIn } = project.dimensions

  for (const suggestion of [
    panelSuggestion('widthIn', 'Width', widthIn),
    panelSuggestion('lengthIn', 'Length', lengthIn),
    panelSuggestion('wallHeightIn', 'Wall height', wallHeightIn),
  ]) {
    if (suggestion) items.push(suggestion)
  }

  if (wallHeightIn > 120) {
    items.push({
      id: 'tall-wall',
      level: 'warning',
      title: 'Tall wall framing',
      message:
        'Walls above 10 feet can require different member sizing, bracing, and handling. BuildIt does not verify those requirements.',
    })
  }

  for (const opening of project.openings) {
    const span = wallSpan(project, opening.wall)
    const [start, end] = openingBounds(opening)
    const edgeClearance = span / 2 - Math.max(Math.abs(start), Math.abs(end))

    if (start < -span / 2 || end > span / 2) {
      items.push({
        id: `outside-${opening.id}`,
        level: 'blocked',
        title: `${opening.type === 'door' ? 'Door' : 'Window'} falls outside its wall`,
        message: 'Move or resize the opening so its full width remains within the wall.',
      })
    } else if (edgeClearance < 16) {
      items.push({
        id: `corner-${opening.id}`,
        level: 'warning',
        title: 'Opening is close to a corner',
        message:
          'Less than 16 inches remains between this opening and the wall end. Corner framing and trim may be crowded.',
      })
    }

    if (opening.sillHeightIn + opening.heightIn > wallHeightIn - 7) {
      items.push({
        id: `height-${opening.id}`,
        level: 'blocked',
        title: 'Opening conflicts with the top plates',
        message:
          'Lower or shorten the opening to leave room for its header and the wall top plates.',
      })
    }
  }

  for (let index = 0; index < project.openings.length; index += 1) {
    const first = project.openings[index]
    for (let otherIndex = index + 1; otherIndex < project.openings.length; otherIndex += 1) {
      const second = project.openings[otherIndex]
      if (first.wall !== second.wall) continue
      const [firstStart, firstEnd] = openingBounds(first)
      const [secondStart, secondEnd] = openingBounds(second)
      const horizontalOverlap = firstStart < secondEnd && secondStart < firstEnd
      const verticalOverlap =
        first.sillHeightIn < second.sillHeightIn + second.heightIn &&
        second.sillHeightIn < first.sillHeightIn + first.heightIn
      if (horizontalOverlap && verticalOverlap) {
        items.push({
          id: `overlap-${first.id}-${second.id}`,
          level: 'blocked',
          title: 'Openings overlap',
          message: `The ${first.type} and ${second.type} on the ${first.wall} wall occupy the same framing area.`,
        })
      }
    }
  }

  const longestStock = 192
  if (Math.max(widthIn, lengthIn) > longestStock) {
    items.push({
      id: 'stock-length',
      level: 'warning',
      title: 'Some members exceed catalog stock lengths',
      message:
        'The current catalog stops at 16-foot lumber. Long plates or rim boards need splices or a revised stock plan.',
    })
  }

  if (items.length === 0) {
    items.push({
      id: 'no-guidance',
      level: 'suggestion',
      title: 'Design fits the current modeling rules',
      message: 'No notable geometry or material-fit issues were found for this configuration.',
    })
  }

  return items
}
