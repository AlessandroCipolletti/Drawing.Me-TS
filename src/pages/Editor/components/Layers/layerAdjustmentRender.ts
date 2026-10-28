import { v4 as uuidv4 } from 'uuid'
import { waitWorkerMessage } from 'utils/jsUtils'
import { applyAdjustmentFilter, blendWithSelectionMask } from './layerAdjustmentFilters'
import type { AdjustmentSpec } from './layerAdjustmentTypes'
import { getAdjustmentPipeline } from './layerAdjustmentTypes'
import { ADJUSTMENT_PROXY_MAX_EDGE } from './layerAdjustmentTypes'
import type { LayerRecord } from './layersState'
import { findAdjustmentForTarget, state } from './layersState'
import { getLassoBezierCurvePoints, type LassoPoint } from './layerLasso'
import { compositeSourceToDisplay, getLayerDomCanvas } from './layerMask'
import { layersBridge } from './layersBridge'

const selectionMaskCache = new WeakMap<LayerRecord, Uint8Array>()

let adjustmentWorker: Worker | null = null

const getAdjustmentWorker = (): Worker | null => {
  if (typeof Worker === 'undefined') return null
  if (!adjustmentWorker) {
    adjustmentWorker = new Worker(
      new URL('../../../../utils/workers/adjustmentFilter.ts', import.meta.url),
      { type: 'module' }
    )
  }
  return adjustmentWorker
}

export const isAdjustmentLayer = (layer: LayerRecord | undefined): boolean =>
  layer?.layerKind === 'adjustment' && Boolean(layer.adjustmentSpec)

export const getAdjustmentTargetLayer = (adjustmentLayer: LayerRecord): LayerRecord | undefined => {
  const id = adjustmentLayer.maskBelowLayerId
  if (!id) return undefined
  return state.layers[id]
}

export const rasterizeSelectionMask = (
  width: number,
  height: number,
  spec: AdjustmentSpec,
  sourceWidth = width,
  sourceHeight = height
): Uint8Array | null => {
  const sel = spec.selection
  if (!sel?.points?.length || sel.points.length < 3) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  // Selection points live in full-canvas coordinates; the work image may be a
  // scaled-down proxy, so draw the mask in source space and let it scale.
  ctx.scale(width / sourceWidth, height / sourceHeight)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, sourceWidth, sourceHeight)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  if (sel.inverted) ctx.rect(0, 0, sourceWidth, sourceHeight)
  const rings: LassoPoint[][] = sel.rings?.length
    ? sel.rings
    : [getLassoBezierCurvePoints(sel.points, true)]
  for (const ring of rings) {
    if (ring.length < 3) continue
    ctx.moveTo(ring[0][0], ring[0][1])
    for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1])
    ctx.closePath()
  }
  ctx.fill('evenodd')
  const data = ctx.getImageData(0, 0, width, height).data
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i++) {
    mask[i] = data[i * 4]
  }
  canvas.width = canvas.height = 0
  return mask
}

const getSelectionMask = (
  layer: LayerRecord,
  spec: AdjustmentSpec,
  w: number,
  h: number,
  sourceW: number,
  sourceH: number
): Uint8Array | null => {
  if (!spec.selection) return null
  let mask = selectionMaskCache.get(layer)
  if (!mask || mask.length !== w * h) {
    mask = rasterizeSelectionMask(w, h, spec, sourceW, sourceH) ?? undefined
    if (mask) selectionMaskCache.set(layer, mask)
  }
  return mask ?? null
}

const computeProxyScale = (w: number, h: number, maxEdge: number) => {
  const scale = Math.max(1, Math.max(w, h) / maxEdge)
  return {
    workW: Math.max(1, Math.round(w / scale)),
    workH: Math.max(1, Math.round(h / scale)),
  }
}

const readSourcePixels = (
  source: HTMLCanvasElement | OffscreenCanvas,
  workW: number,
  workH: number
): ImageData => {
  const work = document.createElement('canvas')
  work.width = workW
  work.height = workH
  const ctx = work.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, workW, workH)
  const imageData = ctx.getImageData(0, 0, workW, workH)
  work.width = work.height = 0
  return imageData
}

const filterImageDataSync = (
  imageData: ImageData,
  spec: AdjustmentSpec,
  mask: Uint8Array | null,
  pixelScale = 1
) => {
  const original = new Uint8ClampedArray(imageData.data)
  for (const step of getAdjustmentPipeline(spec)) {
    applyAdjustmentFilter(imageData, step.filter, step.params, pixelScale)
  }
  if (mask) {
    blendWithSelectionMask(original, imageData.data, mask, imageData.width, imageData.height)
  }
}

const filterImageDataAsync = async (
  imageData: ImageData,
  spec: AdjustmentSpec,
  mask: Uint8Array | null
): Promise<ImageData> => {
  const worker = getAdjustmentWorker()
  if (!worker) {
    filterImageDataSync(imageData, spec, mask)
    return imageData
  }
  const id = uuidv4()
  const dataCopy = imageData.data.buffer.slice(0)
  const transfer: Transferable[] = [dataCopy]
  const maskCopy = mask ? mask.buffer.slice(0) : undefined
  if (maskCopy) transfer.push(maskCopy)
  worker.postMessage(
    {
      id,
      width: imageData.width,
      height: imageData.height,
      data: dataCopy,
      filter: spec.filter,
      params: spec.params,
      steps: getAdjustmentPipeline(spec).map((step) => ({
        filter: step.filter,
        params: step.params,
      })),
      mask: maskCopy,
    },
    transfer
  )
  const res = (await waitWorkerMessage(worker, id)) as { data: ArrayBuffer }
  return new ImageData(new Uint8ClampedArray(res.data), imageData.width, imageData.height)
}

export type AdjustmentRenderQuality = 'proxy' | 'full'

export const renderAdjustmentLayerPixels = async (
  adjustmentLayer: LayerRecord,
  targetCanvas: HTMLCanvasElement | OffscreenCanvas,
  quality: AdjustmentRenderQuality = 'full'
): Promise<void> => {
  const spec = adjustmentLayer.adjustmentSpec
  if (!spec || !adjustmentLayer.canvas) return
  const fullW = targetCanvas.width
  const fullH = targetCanvas.height
  if (fullW <= 0 || fullH <= 0) return

  if (adjustmentLayer.canvas.width !== fullW || adjustmentLayer.canvas.height !== fullH) {
    adjustmentLayer.canvas.width = fullW
    adjustmentLayer.canvas.height = fullH
  }

  const useProxy = quality === 'proxy'
  const { workW, workH } = useProxy
    ? computeProxyScale(fullW, fullH, ADJUSTMENT_PROXY_MAX_EDGE)
    : { workW: fullW, workH: fullH }

  const pipelineStepsList = getAdjustmentPipeline(spec)
  if (!pipelineStepsList.length) {
    adjustmentLayer.canvas.context.clearRect(0, 0, fullW, fullH)
    return
  }

  const mask = getSelectionMask(adjustmentLayer, spec, workW, workH, fullW, fullH)

  let imageData = readSourcePixels(targetCanvas, workW, workH)
  const pixelCount = workW * workH
  const pipelineSteps = getAdjustmentPipeline(spec).length
  const useWorker =
    !useProxy &&
    pipelineSteps === 1 &&
    (spec.filter === 'blur' || pixelCount > 512 * 512) &&
    getAdjustmentWorker()

  if (useWorker) {
    imageData = await filterImageDataAsync(imageData, spec, mask)
  } else {
    filterImageDataSync(imageData, spec, mask, useProxy ? workW / fullW : 1)
  }

  const ctx = adjustmentLayer.canvas.context
  ctx.clearRect(0, 0, fullW, fullH)
  if (useProxy || workW !== fullW || workH !== fullH) {
    const tmp = document.createElement('canvas')
    tmp.width = workW
    tmp.height = workH
    tmp.getContext('2d')!.putImageData(imageData, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(tmp, 0, 0, fullW, fullH)
    tmp.width = tmp.height = 0
  } else {
    ctx.putImageData(imageData, 0, 0)
  }
}

export const invalidateAdjustmentSelectionCache = (layer: LayerRecord) => {
  selectionMaskCache.delete(layer)
}

const syncAdjustmentCoverage = (adjustmentLayerId: string) => {
  const layer = state.layers[adjustmentLayerId]
  const target = layer ? getAdjustmentTargetLayer(layer) : undefined
  if (!layer || !target) return
  const active = Boolean(layer.adjustmentSpec && getAdjustmentPipeline(layer.adjustmentSpec).length)
  getLayerDomCanvas(target).style.visibility = active ? 'hidden' : ''
}

/**
 * One filter paint at a time. Moves that arrive while it runs only keep the
 * newest request; that request starts as soon as the current paint finishes.
 */
let renderInFlight = false
let pendingLayerId: string | null = null
let pendingFull = false

const paintScheduledAdjustment = async (layerId: string, quality: AdjustmentRenderQuality) => {
  const layer = state.layers[layerId]
  const target = layer ? getAdjustmentTargetLayer(layer) : undefined
  if (!layer || !target?.canvas) return
  await renderAdjustmentLayerPixels(layer, target.canvas, quality)
  compositeSourceToDisplay(layerId)
  syncAdjustmentCoverage(layerId)
  if (quality === 'full') layersBridge.updateLayerPreview(layerId)
}

const pumpAdjustmentRenders = async () => {
  if (renderInFlight) return
  renderInFlight = true
  try {
    while (pendingLayerId) {
      const layerId = pendingLayerId
      const quality: AdjustmentRenderQuality = pendingFull ? 'full' : 'proxy'
      pendingLayerId = null
      pendingFull = false
      await paintScheduledAdjustment(layerId, quality)
    }
  } finally {
    renderInFlight = false
    if (pendingLayerId) void pumpAdjustmentRenders()
  }
}

export const scheduleAdjustmentRender = (
  adjustmentLayerId: string,
  quality: AdjustmentRenderQuality
) => {
  pendingLayerId = adjustmentLayerId
  if (quality === 'full') pendingFull = true
  void pumpAdjustmentRenders()
}

export const renderAndCompositeAdjustment = async (
  adjustmentLayerId: string,
  quality: AdjustmentRenderQuality = 'full'
) => {
  const layer = state.layers[adjustmentLayerId]
  const target = layer ? getAdjustmentTargetLayer(layer) : undefined
  if (!layer || !target?.canvas) return
  await renderAdjustmentLayerPixels(layer, target.canvas, quality)
  compositeSourceToDisplay(adjustmentLayerId)
  syncAdjustmentCoverage(adjustmentLayerId)
}

export const bakeAdjustmentOntoContext = async (
  adjustmentLayer: LayerRecord,
  targetCanvas: HTMLCanvasElement | OffscreenCanvas,
  destCtx: CanvasRenderingContext2D
): Promise<void> => {
  await renderAdjustmentLayerPixels(adjustmentLayer, targetCanvas, 'full')
  destCtx.globalCompositeOperation = 'source-over'
  destCtx.globalAlpha = 1
  destCtx.drawImage(adjustmentLayer.canvas, 0, 0)
}

export const findAdjustmentLayerAbove = (
  targetLayerId: string,
  layers: Record<string, LayerRecord>
): LayerRecord | undefined => {
  const target = layers[targetLayerId]
  if (!target) return undefined
  return Object.values(layers).find(
    (l) =>
      l.layerKind === 'adjustment' &&
      l.maskBelowLayerId === targetLayerId &&
      l.order === target.order + 1
  )
}

export const invalidateAdjustmentsForTarget = (targetLayerId: string) => {
  const adj = findAdjustmentForTarget(targetLayerId)
  if (!adj) return
  scheduleAdjustmentRender(adj.id, 'proxy')
  scheduleAdjustmentRender(adj.id, 'full')
}
