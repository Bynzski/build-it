export function roundTo(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

export function formatFeetInches(totalInches: number): string {
  const sign = totalInches < 0 ? '−' : ''
  const absolute = Math.abs(totalInches)
  let feet = Math.floor(absolute / 12)
  let sixteenths = Math.round((absolute - feet * 12) * 16)

  if (sixteenths === 12 * 16) {
    feet += 1
    sixteenths = 0
  }

  const wholeInches = Math.floor(sixteenths / 16)
  const numerator = sixteenths % 16
  if (numerator === 0) return `${sign}${feet}′ ${wholeInches}″`

  const greatestCommonDivisor = (left: number, right: number): number =>
    right === 0 ? left : greatestCommonDivisor(right, left % right)
  const divisor = greatestCommonDivisor(numerator, 16)
  const fraction = `${numerator / divisor}/${16 / divisor}`
  const inches = wholeInches > 0 ? `${wholeInches} ${fraction}` : fraction

  return `${sign}${feet}′ ${inches}″`
}

export function squareInchesToSquareFeet(areaSqIn: number): number {
  return areaSqIn / 144
}

export function formatSquareFeet(areaSqIn: number): string {
  return `${squareInchesToSquareFeet(areaSqIn).toFixed(1)} sq ft`
}
