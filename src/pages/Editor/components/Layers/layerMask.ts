import * as Coworking from 'modules/Coworking'
import {
  fillCanvasWithImage,
  getNewContextForCanvas,
  type ExtendedCanvasContext,
} from 'utils/canvasUtils'
import { layersBridge } from './layersBridge'
import {
  invalidateAdjustmentsForTargetLayer,
  syncAdjustmentLayerDisplay,
} from './layerDisplayHooks'
import { LayerCanvasElement, LayerRecord, state } from './layersState'

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

/** Ids linked by a clip mask, including this layer. One id when there is no link. */
const getMaskPartnerIds = (layerId: string): string[] => {
  const layer = state.layers[layerId]
  if (!layer) return []
  const ids = [layerId]
  if (layer.maskBelowLayerId && state.layers[layer.maskBelowLayerId]) {
    ids.push(layer.maskBelowLayerId)
  }
  const upper = findUpperLayerMaskedBy(layerId)
  if (upper && !ids.includes(upper.id)) ids.push(upper.id)
  return ids
}

export const isLayerInMaskPair = (layerId: string): boolean => getMaskPartnerIds(layerId).length > 1

const getCoworkerSelectedLayerId = (): string | false => {
  if (!Coworking.isOpen()) return false
  const selected = Object.values(state.layers).find(
    (layer) => layer.owner !== Coworking.getUserId() && layer.selected
  )
  return selected?.id || false
}

/** Coworker selection occupies every layer in that mask pair. */
export const isLayerOccupiedByCoworker = (layerId: string): boolean => {
  const selectedId = getCoworkerSelectedLayerId()
  if (!selectedId) return false
  return getMaskPartnerIds(selectedId).includes(layerId)
}

/**
 * A layer can be taken for a mask when it is already ours or has no owner.
 * A layer owned by the coworker is not free, even if they are not drawing on it.
 */
const isLayerClaimable = (layerId: string): boolean => {
  const layer = state.layers[layerId]
  if (!layer || isLayerOccupiedByCoworker(layerId)) return false
  return !layer.owner || layer.owner === Coworking.getUserId()
}

export const findSelectableLayerForUser = (): string =>
  Object.values(state.layers)
    .filter(
      (layer) => layer.owner === Coworking.getUserId() && !isLayerOccupiedByCoworker(layer.id)
    )
    .sort((a, b) => b.order - a.order)[0]?.id || ''

export const resolveOwnedSelectableLayer = (layerId: string): string => {
  if (
    layerId &&
    state.layers[layerId]?.owner === Coworking.getUserId() &&
    !isLayerOccupiedByCoworker(layerId)
  ) {
    return layerId
  }
  return findSelectableLayerForUser()
}

export const canToggleMaskDown = (layerId: string): boolean => {
  const layer = state.layers[layerId]
  if (!layer) return false
  if (layer.maskBelowLayerId) {
    return isLayerClaimable(layerId) && isLayerClaimable(layer.maskBelowLayerId)
  }
  if (!isLayerClaimable(layerId) || layer.order <= 0) return false
  const lower = getLayerDirectlyBelow(layerId)
  if (!lower || !isLayerClaimable(lower.id)) return false
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
    const canvas = document.createElement('canvas') as typeof layer.canvas
    canvas.width = layer.canvas.width
    canvas.height = layer.canvas.height
    canvas.context = getNewContextForCanvas(canvas, true)
    canvas.classList.add('editor__layer-canvas')
    layer.displayCanvas = canvas
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
  if (maskCanvas && upper.layerKind !== 'adjustment') {
    applyDestinationInMask(displayCanvas.context, maskCanvas)
  }
}

export const paintLayerDisplay = (
  layerId: string,
  paint: (ctx: CanvasRenderingContext2D) => void
) => {
  const layer = state.layers[layerId]
  if (!layer) return
  ensureLayerDisplayCanvas(layer)
  const display = layer.displayCanvas!
  const ctx = display.context
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  paint(ctx)
  const maskCanvas = getMaskCanvasForUpper(layerId)
  if (layer.maskBelowLayerId && maskCanvas) {
    applyDestinationInMask(ctx, maskCanvas)
  }
  ctx.restore()
}

const paintPendingLassoFloat = (layerId: string) => {
  const selection = state.lassoSelection
  if (!selection) return
  paintLayerDisplay(layerId, (ctx) => {
    fillCanvasWithImage(ctx, selection.outsideCanvas, 0, 0)
    fillCanvasWithImage(
      ctx,
      selection.selectedCanvas,
      selection.minX,
      selection.minY,
      undefined,
      undefined,
      undefined,
      false
    )
  })
}

export const syncLayerDisplay = (layerId: string) => {
  const layer = state.layers[layerId]
  if (!layer) return
  if (layer.layerKind === 'adjustment' && layer.adjustmentSpec) {
    syncAdjustmentLayerDisplay(layerId)
    return
  }
  if (state.lassoFloatDirty && state.lassoSelection && state.currentSelectedLayerId === layerId) {
    paintPendingLassoFloat(layerId)
    return
  }
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
  if (upper.layerKind === 'adjustment') {
    invalidateAdjustmentsForTargetLayer(changedLayerId)
  } else {
    compositeSourceToDisplay(upper.id)
  }
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
