import History from 'modules/History'
import * as Coworking from 'modules/Coworking'
import * as Tools from 'pages/Editor/components/Tools'
import { editorFacade } from 'pages/Editor/editorFacade'
import { findImageContentCoords } from 'utils/imageUtils'
import { fillCanvasWithImage } from 'utils/canvasUtils'
import {
  HISTORY_STEP_LAYER_CONTENT,
  HISTORY_STEP_LAYER_OPACITY,
  HISTORY_STEP_LAYER_SHOW,
  HISTORY_STEP_LAYER_HIDE,
  HISTORY_STEP_LAYER_ORDER,
  HISTORY_STEP_LAYER_DUPLICATE,
  HISTORY_STEP_LAYER_NEW,
  HISTORY_STEP_LAYER_DELETE,
  HISTORY_STEP_LAYERS_MERGE,
  HISTORY_STEP_LAYER_RENAME,
} from './constants'
import {
  UsersLayersHistory,
  config,
  findFirstLayerForUser,
  findSelectedLayerIdForUser,
  GlobalLayerHistoryAction,
  hardDeleteLayer,
  isYourLayerYours,
  layerCanBeResized,
  LayerHistoryStep,
  state,
} from './layersState'
import { restoreDeletedLayer, updateLayerPreview } from './layersExport'
import {
  _deleteLayer,
  disableLayer,
  enableLayer,
  saveLayerName,
  selectLayer,
} from './layersActions'
import {
  _updateLayerOpacity,
  startResizeMode,
  updateGcoMode,
  updateLayerOrger,
  updateResizeMode,
} from './layersListUi'

export const updateUndoRedoButtons = () => {
  if (state.resizeMode) {
    Tools.toggleButton('undo', Boolean(state.resizeModeMadeChanges))
    Tools.toggleButton('redo', false)
    return
  }
  const userHistory = UsersLayersHistory[Coworking.getUserId()]
  if (userHistory) {
    Tools.toggleButton('undo', userHistory.canGoBack)
    Tools.toggleButton('redo', userHistory.canGoForward)
  }
}

const cleanGlobalLayersHistoryOldActionIfNeeded = (action: GlobalLayerHistoryAction) => {
  if (action.type === HISTORY_STEP_LAYER_CONTENT && action.layerId) {
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
  } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE && action.newLayerId) {
    hardDeleteLayer(action.newLayerId)
  } else if (action.type === HISTORY_STEP_LAYER_NEW && action.layerId) {
    hardDeleteLayer(action.layerId)
  } else if (action.type === HISTORY_STEP_LAYERS_MERGE && action.newLayerId) {
    hardDeleteLayer(action.newLayerId)
  }
}

export const cleanGlobalLayersHistoryForLayer = (layerId: string) => {
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
  if (layerId === state.currentSelectedLayerId) {
    const canBeResized = layerCanBeResized(layerId)
    const wasInResizeMode = state.resizeMode
    updateResizeMode(state.resizeMode && canBeResized, canBeResized)
    updateGcoMode(state.gcoMode && canBeResized, !state.resizeMode && canBeResized)
    if (wasInResizeMode && !state.resizeMode) {
      editorFacade.hideDragBox()
    }
  } else {
    selectLayer(layerId)
  }
  updateLayerPreview(layerId)
}

const layerHistoryQueues: Record<string, Promise<void>> = {}

export const addLayerHistoryContentChangedStep = async (
  layerId: string | false = state.currentSelectedLayerId
) => {
  if (!layerId) return
  const layerAtCall = state.layers[layerId]
  if (!layerAtCall) return
  const snapshotBitmapPromise = createImageBitmap(layerAtCall.canvas)
  const coordsPromise = findImageContentCoords(layerAtCall.canvas, config.coordsImgScale)

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
    updateLayerPreview(layerId)
    if (isYourLayerYours(layerId)) {
      const wasInResizeMode = state.resizeMode
      updateResizeMode(state.resizeMode && canBeResized, canBeResized)
      updateGcoMode(state.gcoMode && canBeResized, !state.resizeMode && canBeResized)
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

export const addLayerHistoryOpacityStep = async (
  layerId: string,
  newValue: number,
  oldValue: number
) => {
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

export const addLayerHistoryEnableStep = async (layerId: string) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  addGlobalLayersHistoryAction(
    {
      layerId,
      type: HISTORY_STEP_LAYER_SHOW,
    },
    layer.owner
  )
}

export const addLayerHistoryDisableStep = async (layerId: string) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  addGlobalLayersHistoryAction(
    {
      layerId,
      type: HISTORY_STEP_LAYER_HIDE,
    },
    layer.owner
  )
}

export const addLayerHistoryOrderStep = async (
  layerId: string,
  newValue: number,
  oldValue: number
) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  addGlobalLayersHistoryAction(
    {
      layerId,
      type: HISTORY_STEP_LAYER_ORDER,
      newValue,
      oldValue,
    },
    layer.owner
  )
}

export const addLayerHistoryRenameStep = async (
  layerId: string,
  newName: string,
  oldName: string
) => {
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

export const addLayerHistoryDuplicateStep = async (layerId: string, newLayerId: string) => {
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

export const addLayerHistoryNewStep = async (layerId: string) => {
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

export const addLayerHistoryDeleteStep = async (layerId: string, nextSelectedId: string) => {
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

export const addLayerHistoryMergeStep = async (
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

  if (userId === Coworking.getUserId() && state.resizeMode && state.currentSelectedLayerId) {
    const step = state.layers[state.currentSelectedLayerId]?.history.getCurrent()
    if (step) {
      await restoreLayerContentStep(state.currentSelectedLayerId, step)
      startResizeMode()
      Tools.toggleButton('undo', false)
      state.resizeModeMadeChanges = false
    }
  } else {
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
        } else if (action.type === HISTORY_STEP_LAYER_OPACITY && action.layerId) {
          _updateLayerOpacity(action.layerId, action.oldValue || 0)
        } else if (action.type === HISTORY_STEP_LAYER_SHOW && action.layerId) {
          disableLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_HIDE && action.layerId) {
          enableLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_ORDER && action.layerId) {
          updateLayerOrger(action.layerId, action.oldValue || 0)
        } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE && action.newLayerId) {
          await _deleteLayer(action.newLayerId, action.layerId || 0)
        } else if (action.type === HISTORY_STEP_LAYER_NEW && action.layerId) {
          await _deleteLayer(action.layerId, action.prevSelectedId || 0)
          selectedLayerId = action.prevSelectedId || ''
        } else if (action.type === HISTORY_STEP_LAYER_DELETE && action.layerId) {
          await restoreDeletedLayer(action.layerId)
        } else if (
          action.type === HISTORY_STEP_LAYERS_MERGE &&
          action.layerOneId &&
          action.layerTwoId &&
          action.newLayerId
        ) {
          await Promise.all([
            restoreDeletedLayer(action.layerOneId),
            restoreDeletedLayer(action.layerTwoId),
          ])
          await _deleteLayer(action.newLayerId, action.layerOneId)
          selectedLayerId = action.layerOneId
        } else if (action.type === HISTORY_STEP_LAYER_RENAME && action.layerId) {
          saveLayerName(action.layerId, action.oldName || '')
        }

        if (!isYourLayerYours(selectedLayerId)) {
          selectedLayerId = findFirstLayerForUser()
        }

        await selectLayer(selectedLayerId)
      }
    }
  }

  return hasDoneUndo
}

export const undoLayers = async () => {
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
      } else if (action.type === HISTORY_STEP_LAYER_OPACITY && action.layerId) {
        _updateLayerOpacity(action.layerId, action.newValue || 0)
      } else if (action.type === HISTORY_STEP_LAYER_SHOW && action.layerId) {
        enableLayer(action.layerId)
      } else if (action.type === HISTORY_STEP_LAYER_HIDE && action.layerId) {
        disableLayer(action.layerId)
      } else if (action.type === HISTORY_STEP_LAYER_ORDER && action.layerId) {
        updateLayerOrger(action.layerId, action.newValue || 0)
      } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE && action.newLayerId) {
        await restoreDeletedLayer(action.newLayerId)
        selectedLayerId = action.newLayerId
      } else if (action.type === HISTORY_STEP_LAYER_NEW && action.layerId) {
        await restoreDeletedLayer(action.layerId)
      } else if (action.type === HISTORY_STEP_LAYER_DELETE && action.layerId) {
        await _deleteLayer(action.layerId, action.nextSelectedId || 0)
        selectedLayerId = action.nextSelectedId || ''
      } else if (
        action.type === HISTORY_STEP_LAYERS_MERGE &&
        action.layerOneId &&
        action.layerTwoId &&
        action.newLayerId
      ) {
        await Promise.all([_deleteLayer(action.layerOneId), _deleteLayer(action.layerTwoId)])
        await restoreDeletedLayer(action.newLayerId)
        selectedLayerId = action.newLayerId
      } else if (action.type === HISTORY_STEP_LAYER_RENAME && action.layerId) {
        saveLayerName(action.layerId, action.newName || '')
      }

      if (!isYourLayerYours(selectedLayerId)) {
        selectedLayerId = findFirstLayerForUser()
      }

      await selectLayer(selectedLayerId)
    }
  }

  return hasDoneRedo
}

export const redoLayers = async () => {
  const hasDoneRedo = await doRedoForUser(Coworking.getUserId())
  updateUndoRedoButtons()

  if (hasDoneRedo && Coworking.isOpen()) {
    Coworking.sendRedo()
  }
}
