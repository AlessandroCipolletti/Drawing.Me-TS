import * as Coworking from 'modules/Coworking'
import type { ExtendedCanvasContext } from 'utils/canvasUtils'
import { layersBridge } from './layersBridge'
import {
  createNewLayerCanvas,
  isYourLayerYours,
  LayerCanvasElement,
  LayerRecord,
  state,
} from './layersState'

type LayerMaskRole = 'none' | 'upper' | 'lower'

export const getLayerDirectlyBelow = (layerId: string): LayerRecord | undefined => {
  const layer = state.layers[layerId]
  if (!layer) return undefined
  return Object.values(state.layers).find((l) => l.order === layer.order - 1)
}

export const findUpperLayerMaskedBy = (lowerLayerId: string): LayerRecord | undefined =>
  Object.values(state.layers).find((l) => l.maskBelowLayerId === lowerLayerId)

export const getAdjacentMaskGroup = (
  layerId: string
): { upper: LayerRecord; lower: LayerRecord } | null => {
  const layer = state.layers[layerId]
  if (!layer) return null
  if (layer.maskBelowLayerId) {
    const lower = state.layers[layer.maskBelowLayerId]
    if (lower && lower.order === layer.order - 1) return { upper: layer, lower }
    return null
  }
  const upper = findUpperLayerMaskedBy(layerId)
  if (upper && upper.order === layer.order + 1) return { upper, lower: layer }
  return null
}

const getLayerMaskRole = (layerId: string): LayerMaskRole => {
  const layer = state.layers[layerId]
  if (!layer) return 'none'
  if (layer.maskBelowLayerId) return 'upper'
  if (findUpperLayerMaskedBy(layerId)) return 'lower'
  return 'none'
}

export const canToggleMaskDown = (layerId: string): boolean => {
  const layer = state.layers[layerId]
  if (!layer || !isYourLayerYours(layerId)) return false
  if (layer.order <= 0) return false
  const lower = getLayerDirectlyBelow(layerId)
  if (!lower || lower.owner !== Coworking.getUserId()) return false
  if (layer.maskBelowLayerId) return true
  if (getLayerMaskRole(layerId) !== 'none') return false
  if (getLayerMaskRole(lower.id) !== 'none') return false
  return true
}

const getMaskCanvasForUpper = (upperId: string): LayerCanvasElement | null => {
  const upper = state.layers[upperId]
  if (!upper?.maskBelowLayerId) return null
  const maskLayer = state.layers[upper.maskBelowLayerId]
  return maskLayer?.canvas ?? null
}

export const getLayerDomCanvas = (layer: LayerRecord): LayerCanvasElement =>
  layer.displayCanvas ?? layer.canvas

export const ensureLayerDisplayCanvas = (layer: LayerRecord) => {
  if (!layer.displayCanvas) {
    layer.displayCanvas = createNewLayerCanvas()
    layer.displayCanvas.classList.add('editor__layer-canvas')
  }
}

const copySourceToDisplayPlain = (layer: LayerRecord) => {
  if (!layer.displayCanvas) return
  const ctx = layer.displayCanvas.context
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, layer.displayCanvas.width, layer.displayCanvas.height)
  ctx.drawImage(layer.canvas, 0, 0)
}

const applyDestinationInMask = (
  targetCtx: CanvasRenderingContext2D | ExtendedCanvasContext,
  maskCanvas: HTMLCanvasElement | OffscreenCanvas
) => {
  targetCtx.globalCompositeOperation = 'destination-in'
  targetCtx.globalAlpha = 1
  targetCtx.drawImage(maskCanvas, 0, 0)
  targetCtx.globalCompositeOperation = 'source-over'
}

export const compositeSourceToDisplay = (upperId: string) => {
  const upper = state.layers[upperId]
  if (!upper) return
  ensureLayerDisplayCanvas(upper)
  const displayCanvas = upper.displayCanvas!
  const maskCanvas = getMaskCanvasForUpper(upperId)
  copySourceToDisplayPlain(upper)
  if (maskCanvas) {
    applyDestinationInMask(displayCanvas.context, maskCanvas)
  }
}

export const syncLayerDisplay = (layerId: string) => {
  const layer = state.layers[layerId]
  if (!layer) return
  ensureLayerDisplayCanvas(layer)
  if (layer.maskBelowLayerId) {
    compositeSourceToDisplay(layerId)
  } else {
    copySourceToDisplayPlain(layer)
  }
}

export const refreshMaskDependents = (changedLayerId: string) => {
  const upper = findUpperLayerMaskedBy(changedLayerId)
  if (!upper) return
  compositeSourceToDisplay(upper.id)
  layersBridge.updateLayerPreview(upper.id)
}

export const bakeMaskedLayerToSource = (upperId: string) => {
  const upper = state.layers[upperId]
  if (!upper?.maskBelowLayerId) return
  const maskCanvas = getMaskCanvasForUpper(upperId)
  if (maskCanvas) {
    applyDestinationInMask(upper.canvas.context, maskCanvas)
  } else if (upper.displayCanvas) {
    const ctx = upper.canvas.context
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, upper.canvas.width, upper.canvas.height)
    ctx.drawImage(upper.displayCanvas, 0, 0)
  }
}

const breakMaskLinkForLayer = (upperId: string, syncDisplay = true) => {
  const layer = state.layers[upperId]
  if (!layer?.maskBelowLayerId) return
  bakeMaskedLayerToSource(upperId)
  layer.maskBelowLayerId = null
  if (syncDisplay) {
    syncLayerDisplay(upperId)
  }
  void layersBridge.updateLayerRealCoords(upperId)
  layersBridge.updateLayerPreview(upperId)
  layersBridge.updateLayerListMaskAffordances()
  layersBridge.updateEditorCanvas()
}

export const breakMaskLinksInvolvingLayer = (layerId: string) => {
  const layer = state.layers[layerId]
  if (!layer) return
  if (layer.maskBelowLayerId) {
    breakMaskLinkForLayer(layerId)
  }
  const upper = findUpperLayerMaskedBy(layerId)
  if (upper) {
    breakMaskLinkForLayer(upper.id)
  }
}

const validateMaskAdjacencyOrBreak = (upperId: string): boolean => {
  const upper = state.layers[upperId]
  if (!upper?.maskBelowLayerId) return true
  const lower = state.layers[upper.maskBelowLayerId]
  if (!lower || lower.order !== upper.order - 1) {
    void layersBridge.applyLayerMaskLink(upperId, null, true)
    return false
  }
  return true
}

export const validateAllMaskAdjacency = () => {
  Object.values(state.layers).forEach((layer) => {
    if (layer.maskBelowLayerId) {
      validateMaskAdjacencyOrBreak(layer.id)
    }
  })
}

/** Strokes write to source canvas; DOM shows displayCanvas — refresh every live frame. */
export const syncLayerDisplayDuringStroke = (
  layerId: string | false = state.currentSelectedLayerId
) => {
  if (!layerId) return
  const layer = state.layers[layerId]
  if (!layer) return
  if (layer.maskBelowLayerId) {
    compositeSourceToDisplay(layerId)
  } else {
    syncLayerDisplay(layerId)
  }
  refreshMaskDependents(layerId)
}

export const isLayerMasked = (layerId: string | false = state.currentSelectedLayerId): boolean =>
  Boolean(layerId && state.layers[layerId]?.maskBelowLayerId)

/** Line-adaptation draws to canvasForLine first; composite source + overlay, then mask. */
export const compositeMaskedDisplayWithLineOverlay = (
  lineCanvas: HTMLCanvasElement,
  layerId: string | false = state.currentSelectedLayerId
) => {
  if (!layerId) return
  const upper = state.layers[layerId]
  const maskCanvas = getMaskCanvasForUpper(layerId)
  if (!upper?.maskBelowLayerId || !maskCanvas) return
  ensureLayerDisplayCanvas(upper)
  const displayCanvas = upper.displayCanvas!
  const ctx = displayCanvas.context
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height)
  ctx.drawImage(upper.canvas, 0, 0)
  ctx.drawImage(lineCanvas, 0, 0)
  applyDestinationInMask(ctx, maskCanvas)
}
