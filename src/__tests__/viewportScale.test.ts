import { describe, expect, it } from 'vitest'
import { fractionalViewportScaleApplied } from 'utils/viewportUtils'

describe('fractional viewport scale', () => {
  it('accepts a retina scale only when the layout width grows to match it', () => {
    expect(fractionalViewportScaleApplied(744, 1488, 0.5)).toBe(true)
    expect(fractionalViewportScaleApplied(744, 744, 0.5)).toBe(false)
    expect(fractionalViewportScaleApplied(744, 2200, 0.5)).toBe(false)
    expect(fractionalViewportScaleApplied(0, 1488, 0.5)).toBe(false)
    expect(fractionalViewportScaleApplied(744, 744, 1)).toBe(false)
  })
})
