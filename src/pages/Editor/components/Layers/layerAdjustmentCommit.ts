import * as Coworking from 'modules/Coworking'
import type { AdjustmentSpec } from './layerAdjustmentTypes'
import { getAdjustmentPipeline } from './layerAdjustmentTypes'
import { renderAndCompositeAdjustment } from './layerAdjustmentRender'
import { findAdjustmentForTarget, state } from './layersState'
import { layersBridge } from './layersBridge'

export type EffectiveAdjustmentSnapshot = {
  layerId: string
  order: number
  spec: AdjustmentSpec
}

type AdjustPanelSession = {
  targetLayerId: string
  before: EffectiveAdjustmentSnapshot | null
  prevSelectedId: string | false
}

let activeSession: AdjustPanelSession | null = null

const cloneSpec = (spec: AdjustmentSpec): AdjustmentSpec =>
  JSON.parse(JSON.stringify(spec)) as AdjustmentSpec

const resolveAdjustTargetLayerId = (): string | false => {
  const id = state.currentSelectedLayerId
  if (!id) return false
  const layer = state.layers[id]
  if (!layer) return false
  if (layer.layerKind === 'adjustment') {
    return layer.maskBelowLayerId ?? false
  }
  return id
}

const captureEffectiveAdjustment = (targetLayerId: string): EffectiveAdjustmentSnapshot | null => {
  const adj = findAdjustmentForTarget(targetLayerId)
  if (!adj?.adjustmentSpec) return null
  const pipeline = getAdjustmentPipeline(adj.adjustmentSpec)
  if (!pipeline.length) return null
  return {
    layerId: adj.id,
    order: adj.order,
    spec: cloneSpec(adj.adjustmentSpec),
  }
}

const snapshotsEqual = (
  a: EffectiveAdjustmentSnapshot | null,
  b: EffectiveAdjustmentSnapshot | null
): boolean => JSON.stringify(a) === JSON.stringify(b)

export const beginAdjustPanelSession = () => {
  const targetLayerId = resolveAdjustTargetLayerId()
  if (!targetLayerId) {
    activeSession = null
    return
  }
  activeSession = {
    targetLayerId,
    before: captureEffectiveAdjustment(targetLayerId),
    prevSelectedId: state.currentSelectedLayerId,
  }
}

export const beginAdjustPanelSessionIfIdle = () => {
  if (activeSession) return
  beginAdjustPanelSession()
}

export const applyEffectiveAdjustment = async (
  targetLayerId: string,
  snapshot: EffectiveAdjustmentSnapshot | null
) => {
  const current = findAdjustmentForTarget(targetLayerId)
  if (!snapshot) {
    if (current) {
      await layersBridge._deleteLayer(current.id, targetLayerId, false)
    }
    return
  }

  let layer = state.layers[snapshot.layerId]
  if (!layer && state.deletedLayers[snapshot.layerId]) {
    await layersBridge.restoreDeletedLayer(snapshot.layerId, false)
    layer = state.layers[snapshot.layerId]
  }

  if (!layer) return

  layer.adjustmentSpec = cloneSpec(snapshot.spec)
  await renderAndCompositeAdjustment(snapshot.layerId, 'full')
  layersBridge.updateLayerPreview(snapshot.layerId)
  layersBridge.updateEditorCanvas()
}

const syncCoworkingCommit = (
  targetLayerId: string,
  before: EffectiveAdjustmentSnapshot | null,
  after: EffectiveAdjustmentSnapshot | null
) => {
  if (!Coworking.isOpen()) return
  if (!before && after) {
    Coworking.sendAdjustmentLayerCreate(after.layerId, targetLayerId, after.order, after.spec)
    return
  }
  if (before && !after) {
    Coworking.sendDeleteLayer(before.layerId, targetLayerId)
    return
  }
  if (before && after && before.layerId === after.layerId) {
    Coworking.sendAdjustmentLayerUpdate(after.layerId, after.spec)
  }
}

export const finalizeAdjustPanelSession = async () => {
  const session = activeSession
  activeSession = null
  if (!session) return

  const after = captureEffectiveAdjustment(session.targetLayerId)
  const before = session.before

  if (snapshotsEqual(before, after)) {
    await applyEffectiveAdjustment(session.targetLayerId, before)
    return
  }

  await layersBridge.addLayerHistoryAdjustmentStep({
    targetLayerId: session.targetLayerId,
    before,
    after,
    prevSelectedId: session.prevSelectedId,
  })

  syncCoworkingCommit(session.targetLayerId, before, after)
  layersBridge.updateUndoRedoButtons()
}
