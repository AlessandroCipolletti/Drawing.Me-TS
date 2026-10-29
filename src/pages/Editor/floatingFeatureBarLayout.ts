import Params from 'main/Params'
import { getNumberInBetween, round } from 'utils/mathUtils'

export type FloatingFeatureBarId =
  'lasso' | 'adjust' | 'quickShape' | 'resize' | 'gradient' | 'text'

const manualPositions: Partial<Record<FloatingFeatureBarId, { left: number; top: number }>> = {}

export const setFloatingBarManualPosition = (
  id: FloatingFeatureBarId,
  left: number,
  top: number
) => {
  manualPositions[id] = { left: round(left, 0), top: round(top, 0) }
}

export const clearFloatingBarManualPosition = (id: FloatingFeatureBarId) => {
  delete manualPositions[id]
}

export const applyFloatingBarScreenPosition = (barEl: HTMLElement, left: number, top: number) => {
  barEl.style.transform = 'translate3d(-50%, 0, 0)'
  barEl.style.left = `${round(left, 0)}px`
  barEl.style.top = `${round(top, 0)}px`
  barEl.style.bottom = 'auto'
}

export const tryApplyFloatingBarManualPosition = (
  id: FloatingFeatureBarId,
  barEl: HTMLElement | null
): boolean => {
  const manual = manualPositions[id]
  if (!manual || !barEl) return false
  applyFloatingBarScreenPosition(barEl, manual.left, manual.top)
  return true
}

export const clampFloatingBarCenter = (
  barEl: HTMLElement,
  left: number,
  top: number,
  canvasOffset: { left: number; top: number; right: number; bottom: number }
): { left: number; top: number } => {
  const barRect = barEl.getBoundingClientRect()
  const barW = barRect.width || 320
  const barH = barRect.height || 46
  const minLeft = canvasOffset.left + barW / 2 + 10
  const maxLeft = Math.max(minLeft, Params.width - canvasOffset.right - barW / 2 - 10)
  const minTop = canvasOffset.top + 10
  const maxTop = Math.max(minTop, Params.height - canvasOffset.bottom - barH - 10)
  return {
    left: getNumberInBetween(minLeft, maxLeft, left, 0),
    top: getNumberInBetween(minTop, maxTop, top, 0),
  }
}
