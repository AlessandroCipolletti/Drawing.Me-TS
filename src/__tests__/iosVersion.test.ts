import { describe, expect, it } from 'vitest'
import { iosVersionToCheck, scoreOsVersion } from 'modules/iosVersion'

describe('iosVersionToCheck', () => {
  it('keeps a real iOS version from the mobile user agent', () => {
    expect(iosVersionToCheck('26.6', '26.6')).toBe('26.6')
    expect(iosVersionToCheck('16.0.0', '16.0')).toBe('16.0.0')
    expect(scoreOsVersion('26.6')).toBeGreaterThan(scoreOsVersion('16.0.0'))
    expect(scoreOsVersion('16.1')).toBeGreaterThanOrEqual(scoreOsVersion('16.0.0'))
  })

  it('uses the Safari version when iPadOS reports the frozen Mac OS version', () => {
    expect(iosVersionToCheck('10.15.7', '26.6')).toBe('26.6')
    expect(iosVersionToCheck('10_15_7', '26.6')).toBe('26.6')
    expect(scoreOsVersion(iosVersionToCheck('10.15.7', '16.0'))).toBeGreaterThanOrEqual(
      scoreOsVersion('16.0.0')
    )
  })

  it('still rejects an old iPad whose Safari version is below the minimum', () => {
    const version = iosVersionToCheck('10.15.7', '15.6')
    expect(scoreOsVersion(version)).toBeLessThan(scoreOsVersion('16.0.0'))
  })
})
