import {
  clampParams,
  defaultParamsForFilter,
  getAdjustmentPipeline,
  specFromPipeline,
  type AdjustmentFilterKind,
  type AdjustmentParams,
  type AdjustmentPipelineStep,
  type AdjustmentSpec,
} from './layerAdjustmentTypes'
import {
  invalidateAdjustmentSelectionCache,
  scheduleAdjustmentRender,
} from './layerAdjustmentRender'
import { state } from './layersState'

const syncPipelinePrimaryParams = (
  adjustmentSpec: AdjustmentSpec,
  filter: AdjustmentFilterKind,
  params: AdjustmentParams
) => {
  const pipeline = getAdjustmentPipeline(adjustmentSpec)
  let idx = pipeline.findIndex((s) => s.filter === filter && !s.presetKey)
  if (idx < 0) idx = pipeline.findIndex((s) => s.filter === filter)
  const clamped = clampParams(filter, params)
  if (idx >= 0) {
    const prev = pipeline[idx]
    pipeline[idx] = {
      filter: prev.filter,
      params: clamped,
      ...(prev.presetKey ? { presetKey: prev.presetKey } : {}),
    }
  } else {
    pipeline.push({ filter, params: clamped })
  }
  Object.assign(adjustmentSpec, specFromPipeline(adjustmentSpec, pipeline, filter))
}

/**
 * Point an existing adjustment at the selection that is active right now.
 * Without this, an adjustment created before the selection existed (or under
 * an older selection) keeps filtering the whole layer.
 */
export const syncAdjustmentSelectionFromActiveSelection = (layerId: string) => {
  const layer = state.layers[layerId]
  if (!layer?.adjustmentSpec) return
  const selection = state.lassoMode ? state.lassoSelection : null
  if (!selection || selection.points.length < 3) return
  const next = {
    points: selection.points.map((p) => [...p] as [number, number]),
    rings: selection.rings?.map((ring) => ring.map((p) => [...p] as [number, number])),
    inverted: selection.inverted,
  }
  if (JSON.stringify(layer.adjustmentSpec.selection ?? null) === JSON.stringify(next)) return
  layer.adjustmentSpec.selection = next
  invalidateAdjustmentSelectionCache(layer)
}

export const applyAdjustmentSpec = (
  layerId: string,
  spec: Partial<AdjustmentSpec> & {
    filter?: AdjustmentFilterKind
    params?: AdjustmentParams
    pipeline?: AdjustmentPipelineStep[]
  },
  options?: { interactive?: boolean }
) => {
  const layer = state.layers[layerId]
  if (!layer?.adjustmentSpec) return
  if (spec.pipeline) {
    Object.assign(
      layer.adjustmentSpec,
      specFromPipeline(layer.adjustmentSpec, spec.pipeline, spec.filter)
    )
  } else if (spec.params) {
    const filter = spec.filter ?? layer.adjustmentSpec.filter
    const params = clampParams(filter, spec.params)
    syncPipelinePrimaryParams(layer.adjustmentSpec, filter, params)
  } else if (spec.filter) {
    const params = defaultParamsForFilter(spec.filter)
    Object.assign(
      layer.adjustmentSpec,
      specFromPipeline(layer.adjustmentSpec, [{ filter: spec.filter, params }], spec.filter)
    )
  }
  invalidateAdjustmentSelectionCache(layer)
  if (options?.interactive) {
    scheduleAdjustmentRender(layerId, 'proxy')
    return
  }
  scheduleAdjustmentRender(layerId, 'full')
}
