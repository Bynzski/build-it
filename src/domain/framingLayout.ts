export interface LayoutSegment {
  start: number
  end: number
}

const POSITION_TOLERANCE = 0.01

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 10000) / 10000))].sort(
    (a, b) => a - b,
  )
}

/**
 * Locates framing from a common outside-edge datum while keeping the end
 * members inside the actual structural span. This keeps 16/24-inch layout
 * marks aligned between framing and 4-foot panel joints, including walls that
 * butt between two end walls and therefore have a shorter structural span.
 */
export function edgeDatumMemberCenters(
  layoutSpanIn: number,
  structuralSpanIn: number,
  spacingIn: number,
  memberWidthIn = 1.5,
): number[] {
  if (layoutSpanIn <= 0 || structuralSpanIn <= 0 || spacingIn <= 0 || memberWidthIn <= 0) {
    return []
  }

  const structuralStart = -structuralSpanIn / 2
  const structuralEnd = structuralSpanIn / 2
  const firstCenter = structuralStart + memberWidthIn / 2
  const lastCenter = structuralEnd - memberWidthIn / 2
  if (lastCenter <= firstCenter + POSITION_TOLERANCE) return [0]

  const positions = [firstCenter, lastCenter]
  const layoutStart = -layoutSpanIn / 2
  const layoutEnd = layoutSpanIn / 2

  for (
    let position = layoutStart + spacingIn;
    position < layoutEnd - POSITION_TOLERANCE;
    position += spacingIn
  ) {
    if (
      position > firstCenter + memberWidthIn - POSITION_TOLERANCE &&
      position < lastCenter - memberWidthIn + POSITION_TOLERANCE
    ) {
      positions.push(position)
    }
  }

  return uniqueSorted(positions)
}

/**
 * Divides a centered span into the fewest panels possible while requiring
 * every internal end joint to land on a supplied framing centerline.
 * `preferredFirstLengthIn` provides the stagger without sacrificing support.
 */
export function supportAwarePanelSegments(
  spanIn: number,
  maximumLengthIn: number,
  supportCentersIn: number[],
  preferredFirstLengthIn = maximumLengthIn,
): LayoutSegment[] {
  if (spanIn <= 0 || maximumLengthIn <= 0) return []

  const start = -spanIn / 2
  const end = spanIn / 2
  const nodes = uniqueSorted([
    start,
    ...supportCentersIn.filter(
      (position) => position > start + POSITION_TOLERANCE && position < end - POSITION_TOLERANCE,
    ),
    end,
  ])
  const minimumPanelsFrom = Array<number>(nodes.length).fill(Number.POSITIVE_INFINITY)
  minimumPanelsFrom[nodes.length - 1] = 0

  for (let index = nodes.length - 2; index >= 0; index -= 1) {
    for (let next = index + 1; next < nodes.length; next += 1) {
      if (nodes[next] - nodes[index] > maximumLengthIn + POSITION_TOLERANCE) break
      minimumPanelsFrom[index] = Math.min(minimumPanelsFrom[index], 1 + minimumPanelsFrom[next])
    }
  }

  if (!Number.isFinite(minimumPanelsFrom[0])) {
    throw new Error('Framing support spacing leaves a panel end joint unsupported.')
  }

  const segments: LayoutSegment[] = []
  let current = 0
  let firstJoint = true

  while (current < nodes.length - 1) {
    const candidates: number[] = []
    for (let next = current + 1; next < nodes.length; next += 1) {
      if (nodes[next] - nodes[current] > maximumLengthIn + POSITION_TOLERANCE) break
      if (1 + minimumPanelsFrom[next] === minimumPanelsFrom[current]) candidates.push(next)
    }

    const target = firstJoint ? nodes[current] + preferredFirstLengthIn : Number.POSITIVE_INFINITY
    const next = firstJoint
      ? candidates.reduce((best, candidate) => {
          const candidateDistance = Math.abs(nodes[candidate] - target)
          const bestDistance = Math.abs(nodes[best] - target)
          return candidateDistance < bestDistance ||
            (Math.abs(candidateDistance - bestDistance) < POSITION_TOLERANCE &&
              nodes[candidate] > nodes[best])
            ? candidate
            : best
        })
      : (candidates.at(-1) ?? current + 1)

    segments.push({ start: nodes[current], end: nodes[next] })
    current = next
    firstJoint = false
  }

  return segments
}
