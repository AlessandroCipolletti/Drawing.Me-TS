import { getCanvasFromBase64 } from 'utils/imageUtils'
import { flattenSavedLayersToCanvas, type FlattenLayerSlice } from './layerStackFlatten'

/** Flattened drawing for folder share (recomposite from layers when possible, else saved `base64`). */
export const getDrawingExportSource = async (drawing: {
  bitmap?: HTMLCanvasElement | HTMLImageElement
  base64?: string
  layers?: FlattenLayerSlice[]
  canvasWidth?: number
  canvasHeight?: number
  minX?: number
  minY?: number
  maxX?: number
  maxY?: number
}): Promise<HTMLCanvasElement | HTMLImageElement | null> => {
  const { bitmap } = drawing
  if (bitmap instanceof HTMLCanvasElement && bitmap.width > 0) {
    return bitmap
  }
  if (bitmap instanceof HTMLImageElement && (bitmap.naturalWidth || bitmap.width) > 0) {
    return bitmap
  }
  if (
    Array.isArray(drawing.layers) &&
    drawing.layers.length > 0 &&
    drawing.canvasWidth &&
    drawing.canvasHeight
  ) {
    const flattened = await flattenSavedLayersToCanvas(drawing.layers, {
      canvasWidth: drawing.canvasWidth,
      canvasHeight: drawing.canvasHeight,
      minX: drawing.minX,
      minY: drawing.minY,
      maxX: drawing.maxX,
      maxY: drawing.maxY,
    })
    if (flattened) return flattened
  }
  if (typeof drawing.base64 === 'string' && drawing.base64.length > 0) {
    return getCanvasFromBase64(drawing.base64)
  }
  return null
}
