/** Packs a version into a comparable number: 16.0.0 -> 160000, 26.6 -> 260600. */
export const scoreOsVersion = (version: string) =>
  String(version || '')
    .replace(/_/g, '.')
    .split('.')
    .reduce((total, part, index) => {
      return total + (parseInt(part, 10) || 0) * Math.pow(10, 4 - index * 2)
    }, 0)

/**
 * iPadOS loads the desktop site and reports Mac OS X 10.15.x.
 * Safari's version token matches the real iOS release, for example 26.6.
 */
export const iosVersionToCheck = (osVersion: string, browserVersion: string) => {
  const osScore = scoreOsVersion(osVersion)
  if (osScore > 0 && osScore < scoreOsVersion('11')) return browserVersion
  return osVersion
}
