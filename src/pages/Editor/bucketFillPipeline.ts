import { getLayerDomCanvas, syncLayerDisplay } from './components/Layers/layerMask'
import { state as layersState } from './components/Layers/layersState'
import {
  fillWithBucketAt,
  type BucketFillOptions,
  type ExtendedCanvasContext,
} from 'utils/canvasUtils'

export type { BucketFillOptions }

const resolveBucketFillContexts = (
  layerId: string
): {
  readContext: CanvasRenderingContext2D
  writeContext: ExtendedCanvasContext
  width: number
  height: number
} | null => {
  const layer = layersState.layers[layerId]
  if (!layer?.canvas?.context) return null
  syncLayerDisplay(layerId)
  const readCanvas = getLayerDomCanvas(layer)
  const readContext = readCanvas.context
  const writeContext = layer.canvas.context
  const width = layer.canvas.width
  const height = layer.canvas.height
  if (width <= 0 || height <= 0) return null
  return { readContext, writeContext, width, height }
}

export const fillActiveLayerWithBucketAt = (
  layerId: string,
  x: number,
  y: number,
  fillColor: string,
  options?: BucketFillOptions
): false | Promise<void> => {
  const resolved = resolveBucketFillContexts(layerId)
  if (!resolved) return false
  const { readContext, writeContext, width, height } = resolved
  const mergedOptions = {
    ...options,
    preserveTransparentPixels: options?.preserveTransparentPixels ?? Boolean(layersState.gcoMode),
  }
  return fillWithBucketAt(writeContext, readContext, x, y, fillColor, width, height, mergedOptions)
}
