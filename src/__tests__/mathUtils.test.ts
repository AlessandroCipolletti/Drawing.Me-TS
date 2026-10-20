import { describe, it, expect } from 'vitest'
import {
  round,
  getAverage,
  getNumberInBetween,
  getDistanceBetweenTwoPoints,
  getQuadraticBezierCurvePointAtTime,
  getOriginalCoordsFromScaleRotation,
  roundAngleForSteps,
} from 'utils/mathUtils'

describe('mathUtils', () => {
  it('rounds numbers to requested decimal places', () => {
    expect(round(3.14159, 2)).toBe(3.14)
    expect(round(10.555, 1)).toBe(10.6)
    expect(round(42.4, 0)).toBe(42)
  })

  it('computes averages and clamps numbers in between bounds', () => {
    expect(getAverage([10, 20, 30])).toBe(20)
    expect(getNumberInBetween(5, 1, 10)).toBe(5)
    expect(getNumberInBetween(-5, 1, 10)).toBe(1)
    expect(getNumberInBetween(25, 1, 10)).toBe(10)
  })

  it('computes Euclidean distance and quadratic bezier points', () => {
    expect(getDistanceBetweenTwoPoints(0, 0, 3, 4)).toBe(5)
    const [midX, midY] = getQuadraticBezierCurvePointAtTime(0.5, 0, 0, 50, 100, 100, 0, 1)
    expect(midX).toBe(50)
    expect(midY).toBe(50)
  })

  it('snaps rotation angles near step intervals', () => {
    expect(roundAngleForSteps(44, 2.5, 45)).toBe(45)
    expect(roundAngleForSteps(30, 2.5, 45)).toBe(30)
  })

  it('inverts scale and rotation around an origin', () => {
    const [origX, origY] = getOriginalCoordsFromScaleRotation(200, 100, 100, 100, 2, 0)
    expect(origX).toBe(50)
    expect(origY).toBe(0)
  })
})
