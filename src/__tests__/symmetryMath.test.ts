import { describe, it, expect } from 'vitest'
import {
  expandStepForSymmetry,
  getSymmetryRayAngles,
  getSymmetrySectorCount,
  snapGuideRotationRad,
} from 'pages/Editor/guides/symmetryMath'
import { normalizeSymmetryMode, SYMMETRY_SECTOR_COUNTS } from 'pages/Editor/guides/guideTypes'
import type { StrokeSample } from 'utils/canvasUtils'

const baseStep = (): StrokeSample => ({
  type: 'move',
  x: 100,
  y: 50,
  midX: 95,
  midY: 48,
  size: 10,
  alpha: 1,
  rotation: 0.5,
  oldSize: 10,
  oldAlpha: 1,
  oldRotation: 0.4,
  oldMidX: 90,
  oldMidY: 46,
  oldX: 90,
  oldY: 46,
  stepLength: 5,
})

describe('symmetryMath', () => {
  it('mirrors with mode 2 (vertical at rotation 0)', () => {
    const cx = 200
    const cy = 150
    const variants = expandStepForSymmetry(baseStep(), '2', cx, cy, 0)
    expect(variants).toHaveLength(2)
    expect(variants[0]).toEqual(baseStep())
    expect(variants[1].x).toBe(300)
    expect(variants[1].y).toBe(50)
    expect(getSymmetryRayAngles('2', 0)).toHaveLength(1)
  })

  it('mirrors with mode 2 at 90° rotation (horizontal)', () => {
    const cx = 200
    const cy = 150
    const variants = expandStepForSymmetry(baseStep(), '2', cx, cy, Math.PI / 2)
    expect(variants).toHaveLength(2)
    expect(variants[1].x).toBe(100)
    expect(variants[1].y).toBe(250)
  })

  it('produces N variants and expected ray counts for sector counts 2..12', () => {
    for (const mode of SYMMETRY_SECTOR_COUNTS) {
      const n = parseInt(mode, 10)
      expect(getSymmetrySectorCount(mode)).toBe(n)
      const rays = getSymmetryRayAngles(mode, 0)
      const expectedRays = mode === '2' ? 1 : n
      expect(rays).toHaveLength(expectedRays)
      const variants = expandStepForSymmetry(baseStep(), mode, 200, 150, 0)
      expect(variants).toHaveLength(n)
      expect(variants[0]).toEqual(baseStep())
    }
  })

  it('snaps rotation for modes 2–4 only', () => {
    const pi4 = Math.PI / 4
    expect(snapGuideRotationRad('2', 0.5)).toBeCloseTo(pi4, 3)
    expect(snapGuideRotationRad('3', 0.45)).toBeCloseTo(Math.PI / 6, 3)
    expect(snapGuideRotationRad('4', 0.6)).toBeCloseTo(pi4, 3)
    expect(snapGuideRotationRad('8', 0.77)).toBeCloseTo(0.77, 3)
  })

  it('soft magnetism only pulls when within 2° tolerance', () => {
    const pi4 = Math.PI / 4
    const tol = (2 * Math.PI) / 180
    expect(snapGuideRotationRad('2', pi4 + tol * 0.5, tol)).toBeCloseTo(pi4, 3)
    expect(snapGuideRotationRad('2', pi4 + tol * 2, tol)).toBeCloseTo(pi4 + tol * 2, 3)
  })

  it('normalizes symmetry modes including legacy values', () => {
    expect(normalizeSymmetryMode('vertical')).toBe('2')
    expect(normalizeSymmetryMode('horizontal')).toBe('2')
    expect(normalizeSymmetryMode('8')).toBe('8')
    expect(normalizeSymmetryMode('12')).toBe('12')
    expect(normalizeSymmetryMode('quadrant')).toBe('4')
    expect(normalizeSymmetryMode('radial')).toBe('4')
    expect(normalizeSymmetryMode('invalid')).toBe('off')
  })
})
