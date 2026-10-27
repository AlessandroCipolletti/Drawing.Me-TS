import { getCanvasFromBase64, cropImageWithMargin } from 'utils/imageUtils'
import {
  compositeLayerOntoContext,
  normalizeBlendMode,
  type LayerBlendMode,
} from './layerBlendMode'

const maskUpperSourceWithLower = (
  upperSource: CanvasImageSource,
  lowerSource: CanvasImageSource,
  width: number,
  height: number
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(upperSource, 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(lowerSource, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  return canvas
}

export interface FlattenLayerSlice {
  id: string
  order: number
  active: boolean
  opacity: number
  blendMode?: LayerBlendMode | string
  base64?: string
  maskBelowLayerId?: string | null
  minX?: number
  minY?: number
  maxX?: number
  maxY?: number
}

export interface FlattenDrawingMeta {
  canvasWidth: number
  canvasHeight: number
  minX?: number
  minY?: number
  maxX?: number
  maxY?: number
}

const resolveLayerPixelsForStack = (
  layer: FlattenLayerSlice,
  sourceById: Map<string, HTMLCanvasElement>,
  width: number,
  height: number
): HTMLCanvasElement | null => {
  const source = sourceById.get(layer.id)
  if (!source) return null
  if (layer.maskBelowLayerId) {
    const lowerSource = sourceById.get(layer.maskBelowLayerId)
    if (lowerSource) {
      return maskUpperSourceWithLower(source, lowerSource, width, height)
    }
  }
  return source
}

/** Flatten saved layers (blend + mask + opacity) on a transparent background — no paper. */
export const flattenSavedLayersToCanvas = async (
  layers: FlattenLayerSlice[],
  meta: FlattenDrawingMeta,
  { cropToContent = true }: { cropToContent?: boolean } = {}
): Promise<HTMLCanvasElement | null> => {
  const width = meta.canvasWidth
  const height = meta.canvasHeight
  if (!width || !height || !layers.length) return null

  const sorted = [...layers].sort((a, b) => (a.order > b.order ? 1 : -1))
  const sourceById = new Map<string, HTMLCanvasElement>()
  await Promise.all(
    sorted.map(async (layer) => {
      if (layer.base64) {
        sourceById.set(layer.id, await getCanvasFromBase64(layer.base64))
      }
    })
  )

  const off = new OffscreenCanvas(width, height)
  const ctx = off.getContext('2d') as OffscreenCanvasRenderingContext2D | null
  if (!ctx) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const layer of sorted) {
    if (!layer.active) continue
    const pixels = resolveLayerPixelsForStack(layer, sourceById, width, height)
    if (!pixels) continue
    compositeLayerOntoContext(ctx, pixels, layer.opacity ?? 1, normalizeBlendMode(layer.blendMode))
    if (Number.isFinite(layer.minX)) {
      minX = Math.min(minX, layer.minX!)
      minY = Math.min(minY, layer.minY!)
      maxX = Math.max(maxX, layer.maxX!)
      maxY = Math.max(maxY, layer.maxY!)
    }
  }

  const bounds =
    cropToContent && Number.isFinite(minX)
      ? { minX, minY, maxX, maxY }
      : cropToContent && Number.isFinite(meta.minX)
        ? {
            minX: meta.minX!,
            minY: meta.minY!,
            maxX: meta.maxX!,
            maxY: meta.maxY!,
          }
        : null

  if (bounds && Number.isFinite(bounds.minX)) {
    const [cropped] = cropImageWithMargin(off, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)
    const out = document.createElement('canvas')
    out.width = cropped.width
    out.height = cropped.height
    out.getContext('2d')!.drawImage(cropped, 0, 0)
    return out
  }

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  out.getContext('2d')!.drawImage(off, 0, 0)
  return out
}
