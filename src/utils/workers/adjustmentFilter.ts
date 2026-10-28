import {
  applyAdjustmentFilter,
  blendWithSelectionMask,
} from 'pages/Editor/components/Layers/layerAdjustmentFilters'
import type {
  AdjustmentFilterKind,
  AdjustmentParams,
} from 'pages/Editor/components/Layers/layerAdjustmentTypes'

export type AdjustmentWorkerRequest = {
  id: string
  width: number
  height: number
  data: ArrayBuffer
  filter: AdjustmentFilterKind
  params: AdjustmentParams
  steps?: { filter: AdjustmentFilterKind; params: AdjustmentParams }[]
  mask?: ArrayBuffer
}

export type AdjustmentWorkerResponse = {
  id: string
  data: ArrayBuffer
}

self.onmessage = (event: MessageEvent<AdjustmentWorkerRequest>) => {
  const { id, width, height, data, filter, params, steps, mask } = event.data
  const pixels = new Uint8ClampedArray(data)
  const original = new Uint8ClampedArray(pixels)
  const imageData = new ImageData(pixels, width, height)
  const pipeline = steps?.length ? steps : [{ filter, params }]
  pipeline.forEach((step) => applyAdjustmentFilter(imageData, step.filter, step.params))
  if (mask) {
    blendWithSelectionMask(original, pixels, new Uint8Array(mask), width, height)
  }
  const response: AdjustmentWorkerResponse = { id, data: pixels.buffer }
  ;(self as unknown as Worker).postMessage(response, [pixels.buffer])
}
