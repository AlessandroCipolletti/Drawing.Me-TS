import History from 'modules/History'
import * as Coworking from 'modules/Coworking'
import { editorFacade } from 'pages/Editor/editorFacade'
import { findImageContentCoords } from 'utils/imageUtils'
import { fillCanvasWithImage } from 'utils/canvasUtils'
import type { LayerBlendMode } from './layerBlendMode'
import {
  HISTORY_STEP_LAYER_CONTENT,
  HISTORY_STEP_LAYER_OPACITY,
  HISTORY_STEP_LAYER_BLEND_MODE,
  HISTORY_STEP_LAYER_SHOW,
  HISTORY_STEP_LAYER_HIDE,
  HISTORY_STEP_LAYER_ORDER,
  HISTORY_STEP_LAYER_DUPLICATE,
  HISTORY_STEP_LAYER_NEW,
  HISTORY_STEP_LAYER_DELETE,
  HISTORY_STEP_LAYERS_MERGE,
  HISTORY_STEP_LAYER_RENAME,
  HISTORY_STEP_LAYER_MASK,
  HISTORY_STEP_LAYER_CUT_TO_NEW,
  HISTORY_STEP_LAYER_ADJUSTMENT,
} from './constants'
import { applyEffectiveAdjustment } from './layerAdjustmentCommit'
import {
  UsersLayersHistory,
  config,
  findSelectedLayerIdForUser,
  GlobalLayerHistoryAction,
  hardDeleteLayer,
  isYourLayerYours,
  layerCanBeResized,
  layerCanUseLasso,
  LayerHistoryStep,
  state,
} from './layersState'
import { layersBridge, registerLayersBridge } from './layersBridge'
import { editorCalls } from 'pages/Editor/editorCalls'
import {
  compositeSourceToDisplay,
  refreshMaskDependents,
  resolveOwnedSelectableLayer,
  syncLayerDisplay,
} from './layerMask'

const updateUndoRedoButtons = () => {
  const userHistory = UsersLayersHistory[Coworking.getUserId()]
  if (state.resizeMode) {
    editorCalls.toggleButton('undo', Boolean(state.resizeModeMadeChanges || userHistory?.canGoBack))
    editorCalls.toggleButton('redo', false)
    return
  }
  if (userHistory) {
    editorCalls.toggleButton('undo', Boolean(state.lassoSelection || userHistory.canGoBack))
    editorCalls.toggleButton('redo', userHistory.canGoForward)
  }
}

const cleanGlobalLayersHistoryOldActionIfNeeded = (action: GlobalLayerHistoryAction) => {
  if (action.type === HISTORY_STEP_LAYER_CONTENT && action.layerId) {
    const layer = state.layers[action.layerId] || state.deletedLayers[action.layerId]
    if (layer) {
      layer.history.deleteFarest()
    }
  } else if (action.type === HISTORY_STEP_LAYER_CUT_TO_NEW && action.layerId) {
    const layer = state.layers[action.layerId] || state.deletedLayers[action.layerId]
    if (layer) {
      layer.history.deleteFarest()
    }
  } else if (
    action.type === HISTORY_STEP_LAYER_MASK &&
    !action.maskBelowLayerId &&
    action.oldMaskBelowLayerId &&
    action.layerId
  ) {
    const layer = state.layers[action.layerId] || state.deletedLayers[action.layerId]
    if (layer) {
      layer.history.deleteFarest()
    }
  } else if (action.type === HISTORY_STEP_LAYER_DELETE && action.layerId) {
    hardDeleteLayer(action.layerId)
  } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
    if (action.layerOneId) hardDeleteLayer(action.layerOneId)
    if (action.layerTwoId) hardDeleteLayer(action.layerTwoId)
  }
}

const cleanGlobalLayersHistoryOverwrittenActionIfNeeded = (action: GlobalLayerHistoryAction) => {
  if (action.type === HISTORY_STEP_LAYER_CONTENT && action.layerId) {
    const layer = state.layers[action.layerId] || state.deletedLayers[action.layerId]
    if (layer) {
      layer.history.deleteNewest()
    }
  } else if (action.type === HISTORY_STEP_LAYER_CUT_TO_NEW) {
    if (action.layerId) {
      const layer = state.layers[action.layerId] || state.deletedLayers[action.layerId]
      if (layer) {
        layer.history.deleteNewest()
      }
    }
    if (action.newLayerId) {
      hardDeleteLayer(action.newLayerId)
    }
  } else if (
    action.type === HISTORY_STEP_LAYER_MASK &&
    !action.maskBelowLayerId &&
    action.oldMaskBelowLayerId &&
    action.layerId
  ) {
    const layer = state.layers[action.layerId] || state.deletedLayers[action.layerId]
    if (layer) {
      layer.history.deleteNewest()
    }
  } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE && action.newLayerId) {
    hardDeleteLayer(action.newLayerId)
  } else if (action.type === HISTORY_STEP_LAYER_NEW && action.layerId) {
    hardDeleteLayer(action.layerId)
  } else if (action.type === HISTORY_STEP_LAYERS_MERGE && action.newLayerId) {
    hardDeleteLayer(action.newLayerId)
  }
}

const cleanGlobalLayersHistoryForLayer = (layerId: string) => {
  const userHistory = UsersLayersHistory[state.layers[layerId].owner]
  userHistory?.clear()
  updateUndoRedoButtons()
}

const addGlobalLayersHistoryAction = (
  action: GlobalLayerHistoryAction,
  userId = Coworking.getUserId()
) => {
  let userHistory = UsersLayersHistory[userId]
  if (!userHistory) {
    userHistory = new History<GlobalLayerHistoryAction>(config.stepHistoryMaxLength)
    userHistory.add({ type: 'init' })
    UsersLayersHistory[userId] = userHistory
  }
  if (userHistory.isFull) {
    const deletedAction = userHistory.deleteFarest()
    if (deletedAction) {
      cleanGlobalLayersHistoryOldActionIfNeeded(deletedAction)
    }
  }
  const deletedActions = userHistory.add(action)
  deletedActions?.forEach(cleanGlobalLayersHistoryOverwrittenActionIfNeeded)
  updateUndoRedoButtons()
  editorFacade.setDrawingModified()
}

const restoreLayerContentStep = async (layerId: string, step?: LayerHistoryStep) => {
  const layer = state.layers[layerId]
  if (!layer || !step) return
  layer.minX = step.minX
  layer.minY = step.minY
  layer.maxX = step.maxX
  layer.maxY = step.maxY
  if (step.bitmap?.width) {
    fillCanvasWithImage(layer.canvas.context, step.bitmap)
  } else {
    layer.canvas.context.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
  }
  if (layer.maskBelowLayerId) {
    compositeSourceToDisplay(layerId)
  } else {
    syncLayerDisplay(layerId)
  }
  refreshMaskDependents(layerId)
  if (layerId === state.currentSelectedLayerId) {
    const canBeResized = layerCanBeResized(layerId)
    const canUseLasso = layerCanUseLasso(layerId)
    const wasInResizeMode = state.resizeMode
    layersBridge.updateResizeMode(state.resizeMode && canBeResized, canBeResized)
    layersBridge.updateLassoMode(state.lassoMode && canUseLasso, canUseLasso)
    layersBridge.updateGcoMode(state.gcoMode && canBeResized, !state.resizeMode && canBeResized)
    if (wasInResizeMode && !state.resizeMode) {
      editorFacade.hideDragBox()
    }
  } else {
    layersBridge.selectLayer(layerId)
  }
  layersBridge.updateLayerPreview(layerId)
}

const layerHistoryQueues: Record<string, Promise<void>> = {}

const cloneLayerCanvas = (source: HTMLCanvasElement) => {
  const snapshot = document.createElement('canvas')
  snapshot.width = source.width
  snapshot.height = source.height
  snapshot.getContext('2d')?.drawImage(source, 0, 0)
  return snapshot
}

export const addLayerHistoryContentChangedStep = async (
  layerId: string | false = state.currentSelectedLayerId
) => {
  if (!layerId) return
  const layerAtCall = state.layers[layerId]
  if (!layerAtCall) return
  const snapshotCanvas = cloneLayerCanvas(layerAtCall.canvas)
  const snapshotBitmapPromise = createImageBitmap(snapshotCanvas)
  const coordsPromise = findImageContentCoords(snapshotCanvas, config.coordsImgScale)

  const runCommit = async () => {
    const [bitmap, coords] = await Promise.all([snapshotBitmapPromise, coordsPromise])
    const layer = state.layers[layerId]
    if (!layer) {
      bitmap.close?.()
      return
    }
    layer.minX = coords.minX
    layer.minY = coords.minY
    layer.maxX = coords.maxX
    layer.maxY = coords.maxY
    const canBeResized = layerCanBeResized(layerId)
    const canUseLasso = layerCanUseLasso(layerId)
    layer.updateTimestamp = Date.now()
    layer.modified = true
    const step: LayerHistoryStep = {
      bitmap,
      minX: layer.minX,
      minY: layer.minY,
      maxX: layer.maxX,
      maxY: layer.maxY,
    }
    addGlobalLayersHistoryAction(
      {
        layerId,
        type: HISTORY_STEP_LAYER_CONTENT,
      },
      layer.owner
    )
    layer.history.add(step)
    if (isYourLayerYours(layerId) && state.lassoMode && state.lassoSelection) {
      state.lassoHistoryDepth += 1
    }
    if (layer.maskBelowLayerId) {
      compositeSourceToDisplay(layerId)
    } else {
      syncLayerDisplay(layerId)
    }
    refreshMaskDependents(layerId)
    void import('./layerAdjustmentRender').then(({ invalidateAdjustmentsForTarget }) =>
      invalidateAdjustmentsForTarget(layerId)
    )
    layersBridge.updateLayerPreview(layerId)
    if (isYourLayerYours(layerId)) {
      const wasInResizeMode = state.resizeMode
      layersBridge.updateResizeMode(state.resizeMode && canBeResized, canBeResized)
      layersBridge.updateLassoMode(state.lassoMode && canUseLasso, canUseLasso)
      layersBridge.updateGcoMode(state.gcoMode && canBeResized, !state.resizeMode && canBeResized)
      if (wasInResizeMode && !state.resizeMode) {
        editorFacade.hideDragBox()
      }
    }
  }

  const prev = layerHistoryQueues[layerId] || Promise.resolve()
  const next = prev.then(runCommit, runCommit)
  layerHistoryQueues[layerId] = next
  await next
}

export const replaceLatestLayerHistoryContentStep = async (
  layerId: string | false = state.currentSelectedLayerId
) => {
  if (!layerId) return
  const layerAtCall = state.layers[layerId]
  if (!layerAtCall) return
  const snapshotCanvas = cloneLayerCanvas(layerAtCall.canvas)
  const snapshotBitmapPromise = createImageBitmap(snapshotCanvas)
  const coordsPromise = findImageContentCoords(snapshotCanvas, config.coordsImgScale)

  const runReplace = async () => {
    const [bitmap, coords] = await Promise.all([snapshotBitmapPromise, coordsPromise])
    const layer = state.layers[layerId]
    if (!layer) {
      bitmap.close?.()
      return
    }
    layer.minX = coords.minX
    layer.minY = coords.minY
    layer.maxX = coords.maxX
    layer.maxY = coords.maxY
    const canBeResized = layerCanBeResized(layerId)
    const canUseLasso = layerCanUseLasso(layerId)
    layer.updateTimestamp = Date.now()
    layer.modified = true
    const step: LayerHistoryStep = {
      bitmap,
      minX: layer.minX,
      minY: layer.minY,
      maxX: layer.maxX,
      maxY: layer.maxY,
    }
    layer.history.replaceCurrent(step)
    updateUndoRedoButtons()
    editorFacade.setDrawingModified()
    if (layer.maskBelowLayerId) {
      compositeSourceToDisplay(layerId)
    } else {
      syncLayerDisplay(layerId)
    }
    refreshMaskDependents(layerId)
    layersBridge.updateLayerPreview(layerId)
    if (isYourLayerYours(layerId)) {
      const wasInResizeMode = state.resizeMode
      layersBridge.updateResizeMode(state.resizeMode && canBeResized, canBeResized)
      layersBridge.updateLassoMode(state.lassoMode && canUseLasso, canUseLasso)
      layersBridge.updateGcoMode(state.gcoMode && canBeResized, !state.resizeMode && canBeResized)
      if (wasInResizeMode && !state.resizeMode) {
        editorFacade.hideDragBox()
      }
    }
  }

  const prev = layerHistoryQueues[layerId] || Promise.resolve()
  const next = prev.then(runReplace, runReplace)
  layerHistoryQueues[layerId] = next
  await next
}

export const restoreLayerBeforeStrokeForCoworker = async (
  layerId: string,
  mode: 'current' | 'last'
) => {
  if (mode === 'last') {
    await (layerHistoryQueues[layerId] || Promise.resolve())
  }
  const layer = state.layers[layerId]
  if (!layer) return
  const step =
    mode === 'last'
      ? (layer.history.getPrevious() ?? layer.history.getCurrent())
      : layer.history.getCurrent()
  if (step?.bitmap?.width) {
    fillCanvasWithImage(layer.canvas.context, step.bitmap)
  } else {
    layer.canvas.context.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
  }
}

const commitLayerCanvasStepOnly = async (layerId: string) => {
  if (!layerId) return
  const layerAtCall = state.layers[layerId]
  if (!layerAtCall) return
  const snapshotCanvas = cloneLayerCanvas(layerAtCall.canvas)
  const snapshotBitmapPromise = createImageBitmap(snapshotCanvas)
  const coordsPromise = findImageContentCoords(snapshotCanvas, config.coordsImgScale)

  const runCommit = async () => {
    const [bitmap, coords] = await Promise.all([snapshotBitmapPromise, coordsPromise])
    const layer = state.layers[layerId]
    if (!layer) {
      bitmap.close?.()
      return
    }
    layer.minX = coords.minX
    layer.minY = coords.minY
    layer.maxX = coords.maxX
    layer.maxY = coords.maxY
    layer.updateTimestamp = Date.now()
    layer.modified = true
    layer.history.add({
      bitmap,
      minX: layer.minX,
      minY: layer.minY,
      maxX: layer.maxX,
      maxY: layer.maxY,
    })
    if (layer.maskBelowLayerId) {
      compositeSourceToDisplay(layerId)
    } else {
      syncLayerDisplay(layerId)
    }
    refreshMaskDependents(layerId)
    layersBridge.updateLayerPreview(layerId)
  }

  const prev = layerHistoryQueues[layerId] || Promise.resolve()
  const next = prev.then(runCommit, runCommit)
  layerHistoryQueues[layerId] = next
  await next
}

const addLayerHistoryCutToNewStep = async (sourceLayerId: string, newLayerId: string) => {
  const layer = state.layers[sourceLayerId] || state.deletedLayers[sourceLayerId]
  if (!layer) return
  addGlobalLayersHistoryAction(
    {
      type: HISTORY_STEP_LAYER_CUT_TO_NEW,
      layerId: sourceLayerId,
      newLayerId,
    },
    layer.owner
  )
}

const addLayerHistoryOpacityStep = async (layerId: string, newValue: number, oldValue: number) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  addGlobalLayersHistoryAction(
    {
      layerId,
      type: HISTORY_STEP_LAYER_OPACITY,
      newValue,
      oldValue,
    },
    layer.owner
  )
}

const addLayerHistoryBlendModeStep = async (
  layerId: string,
  blendModeNew: LayerBlendMode,
  blendModeOld: LayerBlendMode
) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  addGlobalLayersHistoryAction(
    {
      layerId,
      type: HISTORY_STEP_LAYER_BLEND_MODE,
      blendModeNew,
      blendModeOld,
    },
    layer.owner
  )
}

const addLayerHistoryEnableStep = async (layerId: string) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  addGlobalLayersHistoryAction(
    {
      layerId,
      type: HISTORY_STEP_LAYER_SHOW,
    },
    layer.owner
  )
}

const addLayerHistoryDisableStep = async (layerId: string) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  addGlobalLayersHistoryAction(
    {
      layerId,
      type: HISTORY_STEP_LAYER_HIDE,
    },
    layer.owner
  )
}

const addLayerHistoryOrderStep = async (
  layerId: string,
  newValue: number,
  oldValue: number,
  partnerLayerId?: string
) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  addGlobalLayersHistoryAction(
    {
      layerId,
      partnerLayerId,
      type: HISTORY_STEP_LAYER_ORDER,
      newValue,
      oldValue,
    },
    layer.owner
  )
}

const addLayerHistoryRenameStep = async (layerId: string, newName: string, oldName: string) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  addGlobalLayersHistoryAction(
    {
      layerId,
      type: HISTORY_STEP_LAYER_RENAME,
      newName,
      oldName,
    },
    layer.owner
  )
}

const addLayerHistoryDuplicateStep = async (layerId: string, newLayerId: string) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  addGlobalLayersHistoryAction(
    {
      layerId,
      type: HISTORY_STEP_LAYER_DUPLICATE,
      newLayerId,
    },
    layer.owner
  )
}

const addLayerHistoryNewStep = async (layerId: string) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  const layerOwner = layer.owner
  const prevSelectedLayerIdForOwner = findSelectedLayerIdForUser(layerOwner)

  addGlobalLayersHistoryAction(
    {
      layerId,
      type: HISTORY_STEP_LAYER_NEW,
      prevSelectedId: prevSelectedLayerIdForOwner,
    },
    layerOwner
  )
}

const addLayerHistoryDeleteStep = async (layerId: string, nextSelectedId: string) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  addGlobalLayersHistoryAction(
    {
      layerId,
      type: HISTORY_STEP_LAYER_DELETE,
      nextSelectedId,
    },
    layer.owner
  )
}

const addLayerHistoryMaskStep = async (
  layerId: string,
  maskBelowLayerId: string | null,
  oldMaskBelowLayerId: string | null
) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  addGlobalLayersHistoryAction(
    {
      type: HISTORY_STEP_LAYER_MASK,
      layerId,
      maskBelowLayerId,
      oldMaskBelowLayerId,
    },
    layer.owner
  )
}

const addLayerHistoryAdjustmentStep = async (payload: {
  targetLayerId: string
  before: { layerId: string; order: number; spec: unknown } | null
  after: { layerId: string; order: number; spec: unknown } | null
  prevSelectedId: string | false
}) => {
  const layer = state.layers[payload.targetLayerId]
  if (!layer) return
  addGlobalLayersHistoryAction(
    {
      type: HISTORY_STEP_LAYER_ADJUSTMENT,
      layerId: payload.targetLayerId,
      adjustTargetLayerId: payload.targetLayerId,
      adjustBeforeJson: payload.before ? JSON.stringify(payload.before) : null,
      adjustAfterJson: payload.after ? JSON.stringify(payload.after) : null,
      prevSelectedId: payload.prevSelectedId || undefined,
    },
    layer.owner
  )
}

const addLayerHistoryMergeStep = async (
  layerOneId: string,
  layerTwoId: string,
  newLayerId: string
) => {
  const layer = state.layers[layerOneId] || state.deletedLayers[layerOneId]
  addGlobalLayersHistoryAction(
    {
      type: HISTORY_STEP_LAYERS_MERGE,
      layerOneId,
      layerTwoId,
      newLayerId,
    },
    layer.owner
  )
}

export const doUndoForUser = async (userId: string) => {
  let hasDoneUndo = false

  if (
    userId === Coworking.getUserId() &&
    state.resizeMode &&
    state.resizeModeMadeChanges &&
    state.currentSelectedLayerId
  ) {
    const step = state.layers[state.currentSelectedLayerId]?.history.getCurrent()
    if (step) {
      const wasLassoInPlace = Boolean(state.lassoTransformPoints)
      state.lassoFloatDirty = false
      await restoreLayerContentStep(state.currentSelectedLayerId, step)
      state.resizeModeMadeChanges = false
      if (wasLassoInPlace) {
        await layersBridge.endResizeMode()
      } else {
        layersBridge.startResizeMode()
      }
      updateUndoRedoButtons()
    }
  } else {
    if (userId === Coworking.getUserId() && state.resizeMode) {
      state.lassoFloatDirty = false
      await layersBridge.endResizeMode()
    }
    let keepLassoSelectionOnUndo = false
    if (userId === Coworking.getUserId() && state.lassoMode) {
      if (state.lassoSelection && state.lassoHistoryDepth <= 0) {
        layersBridge.endLassoMode(false)
        updateUndoRedoButtons()
        return false
      }
      if (state.lassoSelection && state.lassoHistoryDepth > 0) {
        state.lassoHistoryDepth -= 1
        keepLassoSelectionOnUndo = true
      } else {
        layersBridge.endLassoMode()
      }
    }
    const userHistory = UsersLayersHistory[userId]
    if (userHistory?.canGoBack) {
      const action = userHistory.getCurrent()
      userHistory.back()

      if (action && (action.layerId || action.newLayerId)) {
        hasDoneUndo = true
        let selectedLayerId = action.layerId || ''
        if (action.type === HISTORY_STEP_LAYER_CONTENT && action.layerId) {
          const step = state.layers[action.layerId].history.back()
          await restoreLayerContentStep(action.layerId, step)
          if (keepLassoSelectionOnUndo) {
            await layersBridge.refreshActiveLassoSelection()
          }
        } else if (
          action.type === HISTORY_STEP_LAYER_CUT_TO_NEW &&
          action.layerId &&
          action.newLayerId
        ) {
          await layersBridge._deleteLayer(action.newLayerId, action.layerId)
          const step = state.layers[action.layerId]?.history.back()
          await restoreLayerContentStep(action.layerId, step)
          selectedLayerId = action.layerId
        } else if (action.type === HISTORY_STEP_LAYER_OPACITY && action.layerId) {
          layersBridge._updateLayerOpacity(action.layerId, action.oldValue || 0)
        } else if (action.type === HISTORY_STEP_LAYER_BLEND_MODE && action.layerId) {
          if (action.blendModeOld) {
            layersBridge._updateLayerBlendMode(action.layerId, action.blendModeOld)
            layersBridge.updateParamsByLayer(action.layerId)
          }
        } else if (action.type === HISTORY_STEP_LAYER_SHOW && action.layerId) {
          layersBridge.disableLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_HIDE && action.layerId) {
          layersBridge.enableLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_ORDER && action.layerId) {
          if (action.partnerLayerId) {
            layersBridge.placeMaskGroupAtUpperOrder(
              action.layerId,
              action.partnerLayerId,
              action.oldValue || 0
            )
          } else {
            layersBridge.updateLayerOrger(action.layerId, action.oldValue || 0)
          }
        } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE && action.newLayerId) {
          await layersBridge._deleteLayer(action.newLayerId, action.layerId || 0)
        } else if (action.type === HISTORY_STEP_LAYER_NEW && action.layerId) {
          await layersBridge._deleteLayer(action.layerId, action.prevSelectedId || 0)
          selectedLayerId = action.prevSelectedId || ''
        } else if (action.type === HISTORY_STEP_LAYER_DELETE && action.layerId) {
          await layersBridge.restoreDeletedLayer(action.layerId)
        } else if (
          action.type === HISTORY_STEP_LAYERS_MERGE &&
          action.layerOneId &&
          action.layerTwoId &&
          action.newLayerId
        ) {
          await Promise.all([
            layersBridge.restoreDeletedLayer(action.layerOneId),
            layersBridge.restoreDeletedLayer(action.layerTwoId),
          ])
          await layersBridge._deleteLayer(action.newLayerId, action.layerOneId)
          selectedLayerId = action.layerOneId
        } else if (action.type === HISTORY_STEP_LAYER_RENAME && action.layerId) {
          layersBridge.saveLayerName(action.layerId, action.oldName || '')
        } else if (action.type === HISTORY_STEP_LAYER_MASK && action.layerId) {
          if (!action.maskBelowLayerId && action.oldMaskBelowLayerId) {
            const step = state.layers[action.layerId]?.history.back()
            await restoreLayerContentStep(action.layerId, step)
          }
          await layersBridge.applyLayerMaskLink(
            action.layerId,
            action.oldMaskBelowLayerId ?? null,
            false,
            false
          )
          layersBridge.updateLayerListMaskAffordances()
        } else if (action.type === HISTORY_STEP_LAYER_ADJUSTMENT && action.adjustTargetLayerId) {
          const before = action.adjustBeforeJson
            ? (JSON.parse(action.adjustBeforeJson) as Parameters<
                typeof applyEffectiveAdjustment
              >[1])
            : null
          await applyEffectiveAdjustment(action.adjustTargetLayerId, before)
          selectedLayerId = action.prevSelectedId || action.adjustTargetLayerId
        }

        selectedLayerId = resolveOwnedSelectableLayer(selectedLayerId)

        await layersBridge.selectLayer(selectedLayerId)
      }
    }
  }

  return hasDoneUndo
}

export const undoLayers = async () => {
  editorFacade.dismissQuickShape()
  const hasDoneUndo = await doUndoForUser(Coworking.getUserId())
  updateUndoRedoButtons()

  if (hasDoneUndo && Coworking.isOpen()) {
    Coworking.sendUndo()
  }
}

export const doRedoForUser = async (userId: string) => {
  let hasDoneRedo = false

  const userHistory = UsersLayersHistory[userId]
  if ((userId !== Coworking.getUserId() || !state.resizeMode) && userHistory?.canGoForward) {
    const action = userHistory.forward()

    if (action && (action.layerId || action.newLayerId)) {
      hasDoneRedo = true
      let selectedLayerId = action.layerId || ''
      if (action.type === HISTORY_STEP_LAYER_CONTENT && action.layerId) {
        const step = state.layers[action.layerId].history.forward()
        await restoreLayerContentStep(action.layerId, step)
      } else if (
        action.type === HISTORY_STEP_LAYER_CUT_TO_NEW &&
        action.layerId &&
        action.newLayerId
      ) {
        const step = state.layers[action.layerId]?.history.forward()
        await restoreLayerContentStep(action.layerId, step)
        await layersBridge.restoreDeletedLayer(action.newLayerId)
        selectedLayerId = action.newLayerId
      } else if (action.type === HISTORY_STEP_LAYER_OPACITY && action.layerId) {
        layersBridge._updateLayerOpacity(action.layerId, action.newValue || 0)
      } else if (action.type === HISTORY_STEP_LAYER_BLEND_MODE && action.layerId) {
        if (action.blendModeNew) {
          layersBridge._updateLayerBlendMode(action.layerId, action.blendModeNew)
          layersBridge.updateParamsByLayer(action.layerId)
        }
      } else if (action.type === HISTORY_STEP_LAYER_SHOW && action.layerId) {
        layersBridge.enableLayer(action.layerId)
      } else if (action.type === HISTORY_STEP_LAYER_HIDE && action.layerId) {
        layersBridge.disableLayer(action.layerId)
      } else if (action.type === HISTORY_STEP_LAYER_ORDER && action.layerId) {
        if (action.partnerLayerId) {
          layersBridge.placeMaskGroupAtUpperOrder(
            action.layerId,
            action.partnerLayerId,
            action.newValue || 0
          )
        } else {
          layersBridge.updateLayerOrger(action.layerId, action.newValue || 0)
        }
      } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE && action.newLayerId) {
        await layersBridge.restoreDeletedLayer(action.newLayerId)
        selectedLayerId = action.newLayerId
      } else if (action.type === HISTORY_STEP_LAYER_NEW && action.layerId) {
        await layersBridge.restoreDeletedLayer(action.layerId)
      } else if (action.type === HISTORY_STEP_LAYER_DELETE && action.layerId) {
        await layersBridge._deleteLayer(action.layerId, action.nextSelectedId || 0)
        selectedLayerId = action.nextSelectedId || ''
      } else if (
        action.type === HISTORY_STEP_LAYERS_MERGE &&
        action.layerOneId &&
        action.layerTwoId &&
        action.newLayerId
      ) {
        await Promise.all([
          layersBridge._deleteLayer(action.layerOneId),
          layersBridge._deleteLayer(action.layerTwoId),
        ])
        await layersBridge.restoreDeletedLayer(action.newLayerId)
        selectedLayerId = action.newLayerId
      } else if (action.type === HISTORY_STEP_LAYER_RENAME && action.layerId) {
        layersBridge.saveLayerName(action.layerId, action.newName || '')
      } else if (action.type === HISTORY_STEP_LAYER_MASK && action.layerId) {
        if (!action.maskBelowLayerId && action.oldMaskBelowLayerId) {
          const step = state.layers[action.layerId]?.history.forward()
          await restoreLayerContentStep(action.layerId, step)
        }
        await layersBridge.applyLayerMaskLink(
          action.layerId,
          action.maskBelowLayerId ?? null,
          false,
          false
        )
        layersBridge.updateLayerListMaskAffordances()
      } else if (action.type === HISTORY_STEP_LAYER_ADJUSTMENT && action.adjustTargetLayerId) {
        const after = action.adjustAfterJson
          ? (JSON.parse(action.adjustAfterJson) as Parameters<typeof applyEffectiveAdjustment>[1])
          : null
        await applyEffectiveAdjustment(action.adjustTargetLayerId, after)
        selectedLayerId = action.prevSelectedId || action.adjustTargetLayerId
      }

      selectedLayerId = resolveOwnedSelectableLayer(selectedLayerId)

      await layersBridge.selectLayer(selectedLayerId)
    }
  }

  return hasDoneRedo
}

export const redoLayers = async () => {
  editorFacade.dismissQuickShape()
  const hasDoneRedo = await doRedoForUser(Coworking.getUserId())
  updateUndoRedoButtons()

  if (hasDoneRedo && Coworking.isOpen()) {
    Coworking.sendRedo()
  }
}

registerLayersBridge({
  addLayerHistoryContentChangedStep,
  addLayerHistoryDeleteStep,
  addLayerHistoryDisableStep,
  addLayerHistoryDuplicateStep,
  addLayerHistoryEnableStep,
  addLayerHistoryMergeStep,
  addLayerHistoryNewStep,
  addLayerHistoryRenameStep,
  addLayerHistoryOpacityStep,
  addLayerHistoryBlendModeStep,
  addLayerHistoryOrderStep,
  addLayerHistoryMaskStep,
  addLayerHistoryCutToNewStep,
  addLayerHistoryAdjustmentStep,
  commitLayerCanvasStepOnly,
  updateUndoRedoButtons,
  cleanGlobalLayersHistoryForLayer,
})
