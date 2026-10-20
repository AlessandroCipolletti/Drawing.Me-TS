import { round } from 'utils/mathUtils'

/**
 * A fractional viewport scale (for example 0.5 on a 2x iPad) is real only when
 * the layout width grows by about 1/scale. iPad Safari often reports a doubled
 * width on the first frame, or ignores a viewport meta tag injected from JS,
 * until a rotation. Accepting that reading makes the UI twice as wide as the screen.
 */
export const fractionalViewportScaleApplied = (
  widthBefore: number,
  widthAfter: number,
  viewportScale: number
): boolean => {
  if (!(widthBefore > 0) || !(viewportScale > 0) || viewportScale >= 1) return false
  const expectedWidth = widthBefore / viewportScale
  return widthAfter >= expectedWidth * 0.8 && widthAfter <= expectedWidth * 1.2
}

export const readVisibleViewport = (): { width: number; height: number } => {
  const innerW = window.innerWidth
  const innerH = window.innerHeight
  const visualW = window.visualViewport?.width
  const visualH = window.visualViewport?.height
  const widthsDisagree =
    typeof visualW === 'number' && innerW > 0 && (visualW / innerW > 1.2 || visualW / innerW < 0.8)
  const heightsDisagree =
    typeof visualH === 'number' && innerH > 0 && (visualH / innerH > 1.2 || visualH / innerH < 0.8)
  if (!visualW || !visualH || widthsDisagree || heightsDisagree) {
    return { width: round(innerW, 0), height: round(innerH, 0) }
  }
  return { width: round(visualW, 0), height: round(visualH, 0) }
}

export const isLandscapeOrientation = (): boolean => {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(orientation: landscape)').matches
  }
  return window.innerWidth > window.innerHeight
}
