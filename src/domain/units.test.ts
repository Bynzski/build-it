import { describe, expect, it } from 'vitest'
import { formatFeetInches, roundTo, squareInchesToSquareFeet } from './units'

describe('imperial units', () => {
  it('formats whole and fractional dimensions', () => {
    expect(formatFeetInches(96)).toBe('8′ 0″')
    expect(formatFeetInches(100.5)).toBe('8′ 4 1/2″')
    expect(formatFeetInches(97.125)).toBe('8′ 1 1/8″')
  })

  it('rounds to construction increments', () => {
    expect(roundTo(97.12, 1)).toBe(97)
    expect(roundTo(97.12, 0.25)).toBe(97)
  })

  it('converts square inches to square feet', () => {
    expect(squareInchesToSquareFeet(1440)).toBe(10)
  })
})
