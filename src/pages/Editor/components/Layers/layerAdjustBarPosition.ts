import Params from 'main/Params'
import { getNumberInBetween } from 'utils/mathUtils'
import {
  applyFloatingBarScreenPosition,
  tryApplyFloatingBarManualPosition,
} from '../../floatingFeatureBarLayout'
import { adjustBarRefs } from './layerAdjustBarRefs'
import { state } from './layersState'

export type AdjustBarCanvasContext = {
  canvasOrigin: HTMLElement | null
  scale: number
  rotation: number
  offset: { left: number; top: number; right: number; bottom: number }
}

const layerBoundsForAdjustBar = (): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} | null => {
  const layerId = state.currentSelectedLayerId
  if (!layerId) return null
  let layer = state.layers[layerId]
  if (!layer) return null
  if (layer.layerKind === 'adjustment' && layer.maskBelowLayerId) {
    layer = state.layers[layer.maskBelowLayerId] ?? layer
  }
  if (!Number.isFinite(layer.minX)) return null
  return { minX: layer.minX, minY: layer.minY, maxX: layer.maxX, maxY: layer.maxY }
}

let repositionAdjustBarHook: (() => void) | null = null

export const registerAdjustBarReposition = (hook: () => void) => {
  repositionAdjustBarHook = hook
}

export const requestAdjustBarReposition = () => {
  if (repositionAdjustBarHook) requestAnimationFrame(repositionAdjustBarHook)
}

export const updateAdjustBarPosition = (canvas: AdjustBarCanvasContext) => {
  const bar = adjustBarRefs.adjustBar
  if (!bar || !state.adjustPanelOpen) return
  if (tryApplyFloatingBarManualPosition('adjust', bar)) return
  const bounds = layerBoundsForAdjustBar()
  if (!bounds) return

  const originRect = canvas.canvasOrigin?.getBoundingClientRect()
  if (!originRect) return

  const rad = ((canvas.rotation || 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const scale = canvas.scale || 1

  const corners: Array<[number, number]> = [
    [bounds.minX / Params.pxScale, bounds.minY / Params.pxScale],
    [bounds.maxX / Params.pxScale, bounds.minY / Params.pxScale],
    [bounds.minX / Params.pxScale, bounds.maxY / Params.pxScale],
    [bounds.maxX / Params.pxScale, bounds.maxY / Params.pxScale],
  ]

  let screenMinX = Infinity
  let screenMaxX = -Infinity
  let screenMinY = Infinity
  let screenMaxY = -Infinity

  for (const [lx, ly] of corners) {
    const sx = originRect.left + (lx * cos - ly * sin) * scale
    const sy = originRect.top + (lx * sin + ly * cos) * scale
    if (sx < screenMinX) screenMinX = sx
    if (sx > screenMaxX) screenMaxX = sx
    if (sy < screenMinY) screenMinY = sy
    if (sy > screenMaxY) screenMaxY = sy
  }

  const barRect = bar.getBoundingClientRect()
  const barW = barRect.width || 320
  const barH = barRect.height || 46

  const minLeft = canvas.offset.left + barW / 2 + 10
  const maxLeft = Math.max(minLeft, Params.width - canvas.offset.right - barW / 2 - 10)
  const minTop = canvas.offset.top + 10
  const maxTop = Math.max(minTop, Params.height - canvas.offset.bottom - barH - 10)

  const centerX = (screenMinX + screenMaxX) / 2
  const centerY = (screenMinY + screenMaxY) / 2
  const targetLeft = getNumberInBetween(minLeft, maxLeft, centerX, 0)
  const targetTop = getNumberInBetween(minTop, maxTop, centerY - barH / 2, 0)

  applyFloatingBarScreenPosition(bar, targetLeft, targetTop)
}
