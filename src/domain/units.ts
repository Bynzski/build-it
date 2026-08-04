export function roundTo(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

export function formatFeetInches(totalInches: number): string {
  const sign = totalInches < 0 ? '−' : ''
  const absolute = Math.abs(totalInches)
  const feet = Math.floor(absolute / 12)
  const inches = Math.round((absolute - feet * 12) * 16) / 16

  if (inches === 12) return `${sign}${feet + 1}′ 0″`
  return `${sign}${feet}′ ${Number.isInteger(inches) ? inches : inches.toFixed(2)}″`
}

export function squareInchesToSquareFeet(areaSqIn: number): number {
  return areaSqIn / 144
}

export function formatSquareFeet(areaSqIn: number): string {
  return `${squareInchesToSquareFeet(areaSqIn).toFixed(1)} sq ft`
}
