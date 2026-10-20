import tplLayers from './layers.tpl?raw'
import './layers.css'

import { v4 as uuidv4 } from 'uuid'
import { getRealScreenMaxSize } from 'main/main'
import Params from 'main/Params'
import History from 'modules/History'
import * as Editor from 'pages/Editor'
import * as Toolbar from 'pages/Editor/components/Toolbar'
import * as Tools from 'pages/Editor/components/Tools'
import * as Coworking from 'modules/Coworking'
import * as ColorPicker from 'pages/Editor/components/ColorPicker'
import * as Messages from 'modules/Messages'
import { preventDefault, loadTemplate, createDom } from 'utils/domUtils'
import { cleanRefs, addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import {
  addInElement,
  removeOutElement,
  fadeOutElements,
  fadeInElements,
} from 'utils/animationsUtils'
import { round, convertAngleDegToRad } from 'utils/mathUtils'
import {
  getImgBase64OffThread,
  cropImageWithMargin,
  resizeImage,
  flipImage,
  findImageContentCoords,
  mergeImages,
  duplicateCanvas,
  getCanvasFromBase64,
} from 'utils/imageUtils'
import {
  getNewContextForCanvas,
  fillCanvasWithImage,
  ExtendedCanvasContext,
} from 'utils/canvasUtils'
import {
  addListScrollClickAndPressHandlers,
  addVerticalDragSliderHandler,
  handleElementsListDragAndDrop,
} from 'utils/uiUtils'
import {
  getMagnetismCoordXForLayer,
  getMagnetismCoordYForLayer,
  getMagnetismCoordLeftForLayer,
  getMagnetismCoordTopForLayer,
  getMagnetismCoordRightForLayer,
  getMagnetismCoordBottomForLayer,
} from './layersUtils'
import { deepCopy, delay, parallelize } from 'utils/jsUtils'
import { timing } from 'main/Theme'

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

const MAX_LAYER_NAME_LENGTH = 12
const PREVIEW_SIZE = 300
const EMPTY_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const config = {
  maxConcurrentThreads: 8,
  stepHistoryMaxLength: 50 + 1,
  maxLayersNumber: 30,
  maxLayersNumberLowPerf: 20,
  maxLayersNumberMediumPerf: 30,
  maxLayersNumberHighPerf: 40,
  paramsCloseDelay: 7_000,
  coordsImgScale: 1,
}

let state: Record<string, any> = {}
const initialState = {
  layers: {} as Record<string, any>,
  deletedLayers: {} as Record<string, any>,
  currentSelectedLayerId: false as string | false,
  resizeMode: false,
  gcoMode: false,
  editorIsUsingEraser: false,
  paramsTimeout: false as ReturnType<typeof setTimeout> | false,
  resizeModeMadeChanges: false,
  listDragStartIndex: -1,
  canvases: {
    width: 0,
    height: 0,
  },
  magnetismCoords: {
    x: [],
    y: [],
    l: [],
    t: [],
    r: [],
    b: [],
  },
  lastResizeCoords: {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    r: 0,
  },
}

const refs: {
  layersContainer: HTMLElement | null
  layersList: HTMLElement | null
  layerListElement: HTMLElement | null
  addNewLayerButton: HTMLElement | null
  paramsContainer: HTMLElement | null
  editLayerNameButton: HTMLElement | null
  duplicateLayerButton: HTMLElement | null
  mergeDownLayerButton: HTMLElement | null
  deleteLayerButton: HTMLElement | null
  flipVerticalButton: HTMLElement | null
  flipHorizontalButton: HTMLElement | null
  sendLayerButton: HTMLElement | null
  gcoButton: HTMLElement | null
  resizeButton: HTMLElement | null
  visibilityLayerButton: HTMLElement | null
  imageForResize: HTMLCanvasElement | OffscreenCanvas | null
  opacitySlider: HTMLElement | null
  opacityCursor: HTMLElement | null
  opacityLabel: HTMLElement | null
} = {
  layersContainer: null,
  layersList: null,
  layerListElement: null,
  addNewLayerButton: null,
  paramsContainer: null,
  editLayerNameButton: null,
  duplicateLayerButton: null,
  mergeDownLayerButton: null,
  deleteLayerButton: null,
  flipVerticalButton: null,
  flipHorizontalButton: null,
  sendLayerButton: null,
  gcoButton: null,
  resizeButton: null,
  visibilityLayerButton: null,
  imageForResize: null,
  opacitySlider: null,
  opacityCursor: null,
  opacityLabel: null,
}

const labels = {
  areYouSureToDeleteLayer: 'Are you sure ?',
  changeLayerName: 'Insert new name for layer',
  areYouSureToSendLayer: 'Do you want to send this layer to your friend ?',
}

let UsersLayersHistory: Record<string, History> = {}

const layerCanBeResized = (layerId: string) =>
  Boolean(
    state.layers[layerId]?.active &&
    Number.isFinite(state.layers[layerId].minX) &&
    state.layers[layerId].opacity > 0
  )

const updateUndoRedoButtons = () => {
  // Fix legacy bug: when resizeMode is active, Undo is only enabled if changes were made
  // during this resize session, and Redo is always disabled.
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

export const getCurrentSelectedLayerId = (): string => state.currentSelectedLayerId || ''
export const getLayerContext = (layerId = state.currentSelectedLayerId): ExtendedCanvasContext =>
  state.layers[layerId]?.canvas?.context

const cleanGlobalLayersHistoryOldActionIfNeeded = (action: any) => {
  if (action.type === HISTORY_STEP_LAYER_CONTENT) {
    const layer = state.layers[action.layerId] || state.deletedLayers[action.layerId]
    if (layer) {
      layer.history.deleteFarest()
    }
  } else if (action.type === HISTORY_STEP_LAYER_DELETE) {
    hardDeleteLayer(action.layerId)
  } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
    hardDeleteLayer(action.layerOneId)
    hardDeleteLayer(action.layerTwoId)
  }
}

const cleanGlobalLayersHistoryOverwrittenActionIfNeeded = (action: any) => {
  if (action.type === HISTORY_STEP_LAYER_CONTENT) {
    const layer = state.layers[action.layerId] || state.deletedLayers[action.layerId]
    if (layer) {
      layer.history.deleteNewest()
    }
  } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE) {
    hardDeleteLayer(action.newLayerId)
  } else if (action.type === HISTORY_STEP_LAYER_NEW) {
    hardDeleteLayer(action.layerId)
  } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
    hardDeleteLayer(action.newLayerId)
  }
}

const cleanGlobalLayersHistoryForLayer = (layerId: string) => {
  const userHistory = UsersLayersHistory[state.layers[layerId].owner]
  userHistory?.clear()
  updateUndoRedoButtons()
}

const addGlobalLayersHistoryAction = (action: any, userId = Coworking.getUserId()) => {
  let userHistory = UsersLayersHistory[userId]
  if (!userHistory) {
    userHistory = new History(config.stepHistoryMaxLength)
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
  Editor.setDrawingModified()
}

const restoreLayerContentStep = async (layerId: string, step: any) => {
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
      Editor.hideDragBox()
    }
  } else {
    selectLayer(layerId)
  }
  updateLayerPreview(layerId)
}

const findSelectedLayerIdForUser = (userId: string) => {
  let result = (Object.values(state.layers) as any[]).find(
    (layer) => layer.owner === userId && layer.selected
  )?.id

  if (!result) {
    result = (Object.values(state.layers) as any[]).find((layer) => layer.owner === userId)?.id
  }

  return result
}

const layerHistoryQueues: Record<string, Promise<void>> = {}

export const addLayerHistoryContentChangedStep = async (layerId = state.currentSelectedLayerId) => {
  const layerAtCall = state.layers[layerId]
  if (!layerAtCall) return
  // Snapshot the canvas bitmap immediately before any async await yields to the next stroke
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
    const step = {
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
        Editor.hideDragBox()
      }
    }
  }

  const prev = layerHistoryQueues[layerId] || Promise.resolve()
  const next = prev.then(runCommit, runCommit)
  layerHistoryQueues[layerId] = next
  await next
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

const addLayerHistoryOrderStep = async (layerId: string, newValue: number, oldValue: number) => {
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

const updateLayerRealCoords = async (layerId = state.currentSelectedLayerId) => {
  if (!state.layers[layerId]) return
  state.layers[layerId] = {
    ...state.layers[layerId],
    ...(await findImageContentCoords(state.layers[layerId].canvas, config.coordsImgScale)),
  }
}

export const setLayerCoordsAfterDragResize = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
) => {
  if (!state.currentSelectedLayerId || !state.layers[state.currentSelectedLayerId]) return
  state.layers[state.currentSelectedLayerId] = {
    ...state.layers[state.currentSelectedLayerId],
    minX,
    minY,
    maxX,
    maxY,
  }
}

const updateLayerPreview = (layerId = state.currentSelectedLayerId) => {
  const layer = state.layers[layerId]
  if (!layer || !layer.previewRef) return

  if (Number.isFinite(layer.minX)) {
    let [preview] = cropImageWithMargin(
      layer.canvas,
      layer.minX,
      layer.minY,
      layer.maxX,
      layer.maxY
    )
    preview = resizeImage(preview, PREVIEW_SIZE)
    layer.previewRef.width = preview.width
    layer.previewRef.height = preview.height
    layer.previewRef.context.drawImage(preview, 0, 0)
  } else {
    layer.previewRef.context.clearRect(0, 0, layer.previewRef.width, layer.previewRef.height)
  }
}

export const doUndoForUser = async (userId: string) => {
  let hasDoneUndo = false

  if (userId === Coworking.getUserId() && state.resizeMode) {
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

      if (action.layerId || action.newLayerId) {
        hasDoneUndo = true
        let selectedLayerId = action.layerId
        if (action.type === HISTORY_STEP_LAYER_CONTENT) {
          const step = state.layers[action.layerId].history.back()
          await restoreLayerContentStep(action.layerId, step)
        } else if (action.type === HISTORY_STEP_LAYER_OPACITY) {
          _updateLayerOpacity(action.layerId, action.oldValue)
        } else if (action.type === HISTORY_STEP_LAYER_SHOW) {
          disableLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_HIDE) {
          enableLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_ORDER) {
          updateLayerOrger(action.layerId, action.oldValue)
        } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE) {
          await _deleteLayer(action.newLayerId, action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_NEW) {
          await _deleteLayer(action.layerId, action.prevSelectedId)
          selectedLayerId = action.prevSelectedId
        } else if (action.type === HISTORY_STEP_LAYER_DELETE) {
          await restoreDeletedLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
          await Promise.all([
            restoreDeletedLayer(action.layerOneId),
            restoreDeletedLayer(action.layerTwoId),
          ])
          await _deleteLayer(action.newLayerId, action.layerOneId)
          selectedLayerId = action.layerOneId
        } else if (action.type === HISTORY_STEP_LAYER_RENAME) {
          saveLayerName(action.layerId, action.oldName)
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

    if (action.layerId || action.newLayerId) {
      hasDoneRedo = true
      let selectedLayerId = action.layerId
      if (action.type === HISTORY_STEP_LAYER_CONTENT) {
        const step = state.layers[action.layerId].history.forward()
        await restoreLayerContentStep(action.layerId, step)
      } else if (action.type === HISTORY_STEP_LAYER_OPACITY) {
        _updateLayerOpacity(action.layerId, action.newValue)
      } else if (action.type === HISTORY_STEP_LAYER_SHOW) {
        enableLayer(action.layerId)
      } else if (action.type === HISTORY_STEP_LAYER_HIDE) {
        disableLayer(action.layerId)
      } else if (action.type === HISTORY_STEP_LAYER_ORDER) {
        updateLayerOrger(action.layerId, action.newValue)
      } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE) {
        await restoreDeletedLayer(action.newLayerId)
        selectedLayerId = action.newLayerId
      } else if (action.type === HISTORY_STEP_LAYER_NEW) {
        await restoreDeletedLayer(action.layerId)
      } else if (action.type === HISTORY_STEP_LAYER_DELETE) {
        await _deleteLayer(action.layerId, action.nextSelectedId)
        selectedLayerId = action.nextSelectedId
      } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
        await Promise.all([_deleteLayer(action.layerOneId), _deleteLayer(action.layerTwoId)])
        await restoreDeletedLayer(action.newLayerId)
        selectedLayerId = action.newLayerId
      } else if (action.type === HISTORY_STEP_LAYER_RENAME) {
        saveLayerName(action.layerId, action.newName)
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

const layerDeepCopy = (
  layer: any,
  {
    exportBitmap = false,
    deepCopyCanvas = true,
    usingOffscreen = false,
  }: { exportBitmap?: boolean; deepCopyCanvas?: boolean; usingOffscreen?: boolean } = {}
) => {
  const copy: Record<string, any> = {
    id: layer.id,
    minX: layer.minX,
    minY: layer.minY,
    maxX: layer.maxX,
    maxY: layer.maxY,
    name: layer.name,
    order: layer.order,
    active: layer.active,
    opacity: layer.opacity,
    modified: layer.modified,
    selected: layer.selected,
    createTimestamp: layer.createTimestamp,
    updateTimestamp: layer.updateTimestamp,
    owner: layer.owner,
  }
  if (deepCopyCanvas) {
    copy.canvas = duplicateCanvas(layer.canvas, usingOffscreen)
  }
  if (exportBitmap) {
    copy.bitmap = layer.history.getCurrent()?.bitmap
  }
  return copy
}

const prepareLayerDataToExport = async (layer: any) => {
  if (layer.bitmap) {
    layer.base64 = await getImgBase64OffThread(layer.bitmap)
  } else if (layer.canvas) {
    const bitmap = await createImageBitmap(layer.canvas)
    layer.base64 = await getImgBase64OffThread(bitmap)
    bitmap.close()
  }
  delete layer.owner
  delete layer.resizeMode
  delete layer.modified
  delete layer.canvas
  delete layer.bitmap
  delete layer.gco
  return layer
}

export const mergeUnchangedLayers = (exportedLayers: any[], previousLayers: any[] = []) => {
  return exportedLayers.map((layer) => {
    if (!layer.base64) {
      layer.base64 = previousLayers.find((pl) => pl.id === layer.id)?.base64
    }
    return layer
  })
}

export const exportLayers = async ({
  exportJustModifiedLayers = true,
  cleanMemoryAfterwards = false,
}: { exportJustModifiedLayers?: boolean; cleanMemoryAfterwards?: boolean } = {}) => {
  const currentLayers = Object.values(state.layers || {}) as any[]
  const layers = currentLayers
    .filter((layer) => !isYourLayerEmpty(layer.id))
    .sort((l1, l2) => (l1.order > l2.order ? 1 : -1))
    .map((l) =>
      layerDeepCopy(l, {
        exportBitmap: !exportJustModifiedLayers || l.modified,
        deepCopyCanvas: false,
      })
    )

  for (const layer of currentLayers) {
    layer.modified = false
  }

  const layerData = await parallelize(layers, prepareLayerDataToExport, config.maxConcurrentThreads)

  if (cleanMemoryAfterwards) {
    currentLayers.forEach((layer) => {
      layer.history?.clear()
      layer.history = undefined
    })
  }

  return layerData
}

export const exportWholeCanvasData = async (returnCanvasContext = false) => {
  const tempCanvas = new OffscreenCanvas(state.canvases.width, state.canvases.height)
  const tempContext = tempCanvas.getContext('2d', {
    willReadFrequently: true,
  }) as OffscreenCanvasRenderingContext2D | null
  const data: Record<string, any> = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    width: 0,
    height: 0,
    canvasWidth: state.canvases.width,
    canvasHeight: state.canvases.height,
    base64: EMPTY_BASE64,
  }

  const layers = (Object.values(state.layers) as any[]).sort((l1, l2) =>
    l1.order > l2.order ? 1 : -1
  )
  for (const layer of layers) {
    if (layer.active && tempContext) {
      tempContext.globalAlpha = layer.opacity
      tempContext.drawImage(layer.canvas, 0, 0)
      data.minX = Math.min(data.minX, layer.minX)
      data.minY = Math.min(data.minY, layer.minY)
      data.maxX = Math.max(data.maxX, layer.maxX)
      data.maxY = Math.max(data.maxY, layer.maxY)
    }
  }
  data.width = round(data.maxX - data.minX, 0)
  data.height = round(data.maxY - data.minY, 0)

  let bitmap: ImageBitmap | null = null
  if (returnCanvasContext) {
    if (Number.isFinite(data.minX)) {
      bitmap = await createImageBitmap(tempCanvas)
      data.base64 = await getImgBase64OffThread(bitmap)
    }
    data.context = tempContext
  } else {
    if (Number.isFinite(data.minX)) {
      const [cropped] = cropImageWithMargin(tempCanvas, data.minX, data.minY, data.maxX, data.maxY)
      bitmap = await createImageBitmap(cropped)
      data.base64 = await getImgBase64OffThread(bitmap)
    }
    tempCanvas.width = tempCanvas.height = 0
  }

  if (bitmap) {
    bitmap.close()
  }

  return data
}

export const isYourLayerEmpty = (layerId = state.currentSelectedLayerId): boolean => {
  const layer = state.layers?.[layerId]
  if (!layer) return true
  return (
    Number.isFinite(layer.maxX) === false ||
    layer.minX === null ||
    layer.maxX === null ||
    layer.minY === null ||
    layer.maxY === null
  )
}

const clearLayer = (layerId: string) => {
  const layer = state.layers[layerId]
  if (!layer) return
  layer.canvas.context.clearRect(0, 0, state.canvases.width, state.canvases.height)
  layer.minX = Infinity
  layer.minY = Infinity
  layer.maxY = -Infinity
  layer.maxX = -Infinity
}

export const clearLayerFromCoworker = (layerId: string) => {
  clearLayer(layerId)
  addLayerHistoryContentChangedStep(layerId)
}

export const clearCurrentLayer = async (): Promise<boolean> => {
  closeParams()
  updateGcoMode(false, false)
  if (
    state.currentSelectedLayerId &&
    Number.isFinite(state.layers[state.currentSelectedLayerId].maxX)
  ) {
    clearLayer(state.currentSelectedLayerId)
    addLayerHistoryContentChangedStep(state.currentSelectedLayerId)
    if (Coworking.isOpen()) {
      Coworking.sendClearLayer(state.currentSelectedLayerId)
    }
    return true
  } else {
    return false
  }
}

const getNextLayerName = () => {
  const existingNames = new Set((Object.values(state.layers) as any[]).map((l) => l.name))
  let index = Object.keys(state.layers).length + 1
  while (existingNames.has(`Layer ${index}`)) {
    index++
  }
  return `Layer ${index}`
}

const createNewLayerData = (owner: string | false = false) => ({
  id: uuidv4(),
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
  name: getNextLayerName(),
  order: getMaxOrder() + 1,
  active: true,
  canvas: null as any,
  opacity: 1,
  history: new History(config.stepHistoryMaxLength, clearLayerHistoryStepBitmap),
  selected: false,
  modified: false,
  previewRef: null as any,
  createTimestamp: Date.now(),
  updateTimestamp: Date.now(),
  owner: owner || Coworking.getUserId(),
})

const getMaxOrder = () => {
  const max = Math.max(...(Object.values(state.layers) as any[]).map((l) => l.order))
  return isFinite(max) ? max : 0
}

const paramsAreClosed = () => state.paramsTimeout === false

const toggleParams = () => {
  if (refs.paramsContainer?.classList.contains('params-container-visible')) {
    closeParams()
  } else {
    openParams()
  }
}

const openParams = async () => {
  if (state.paramsTimeout !== false) {
    clearTimeout(state.paramsTimeout)
  }
  state.paramsTimeout = setTimeout(closeParams, config.paramsCloseDelay)
  refs.paramsContainer?.classList.add('params-container-visible')
}

export const closeParams = async () => {
  if (state.paramsTimeout !== false) {
    refs.paramsContainer?.classList.remove('params-container-visible')
    clearTimeout(state.paramsTimeout)
    state.paramsTimeout = false
    await delay(parseInt(timing.OPTIONS_SHOW_TRANSITION, 10))
  }
}

const restoreDeletedLayer = async (layerId: string, withAnimation = true) => {
  const layer = state.deletedLayers[layerId]
  if (!layer) return
  ;(Object.values(state.layers) as any[]).forEach((l) => {
    if (l.order >= layer.order) {
      l.order++
    }
  })
  state.layers[layerId] = layer
  delete state.deletedLayers[layerId]

  createNewLayerListElementDom(layerId, withAnimation)
  reorderLayersList()
  layer.canvas.style.zIndex = String(layer.order * 10)
  layer.canvas.style.opacity = String(layer.opacity)

  if (state.layers[layerId].active) {
    enableLayer(layerId)
  } else {
    disableLayer(layerId)
  }

  Editor.appendLayer(layer.canvas)
  await updateLayerPreview(layerId)
}

const createNewLayerListElementDom = (layerId: string, withAnimation = true) => {
  if (!refs.layerListElement || !refs.layersList) return
  const layerListDom = refs.layerListElement.cloneNode(true) as HTMLElement
  layerListDom.setAttribute('data-id', layerId)
  const previewCanvas = layerListDom.querySelector(
    '.editor-layers__layer-preview'
  ) as HTMLCanvasElement & {
    context?: CanvasRenderingContext2D | null
  }
  previewCanvas.context = previewCanvas.getContext('2d')
  state.layers[layerId].previewRef = previewCanvas
  layerListDom.classList.toggle(
    'editor-layers__layer-selected',
    Boolean(state.layers[layerId].selected)
  )
  layerListDom.classList.toggle('editor-layers__layer-yours', isYourLayerYours(layerId))
  layerListDom.classList.toggle('editor-layers__layer-coworker', !isYourLayerYours(layerId))
  const input = layerListDom.querySelector('input') as HTMLInputElement
  if (input) {
    input.value = state.layers[layerId].name
    input.addEventListener(Params.eventStart, (e) => {
      e.preventDefault()
    })
  }
  layerListDom
    .querySelector('.editor-layers__layer-options-button')
    ?.classList.toggle('svg-icon-visible', !isYourLayerYours(layerId))

  refs.layersList.appendChild(layerListDom)
  if (withAnimation) {
    addInElement(layerListDom, { commitResult: false })
  }
}

const createNewLayerDom = async (layerId: string, withAnimation = false) => {
  createNewLayerListElementDom(layerId, withAnimation)
  const layer = state.layers[layerId]

  layer.canvas.style.zIndex = String(layer.order * 10)
  layer.canvas.style.opacity = String(layer.opacity)

  if (state.layers[layerId].active) {
    enableLayer(layerId)
  } else {
    disableLayer(layerId)
  }

  updateLayerPreview(layerId)
  Editor.appendLayer(layer.canvas)

  layer.history.add({
    bitmap: await createImageBitmap(layer.canvas),
    minX: layer.minX,
    minY: layer.minY,
    maxX: layer.maxX,
    maxY: layer.maxY,
  })
}

const createNewLayerCanvas = () => {
  const canvas = document.createElement('canvas') as HTMLCanvasElement & {
    context?: ExtendedCanvasContext
  }
  canvas.width = state.canvases.width
  canvas.height = state.canvases.height
  canvas.context = getNewContextForCanvas(canvas)
  return canvas
}

export const selectCoworkerLayer = (layerId: string) => {
  if (state?.layers?.[layerId] && !isYourLayerYours(layerId)) {
    ;(Object.values(state.layers) as any[]).forEach((l) => {
      if (!isYourLayerYours(l.id)) {
        l.selected = l.id === layerId
        refs.layersList
          ?.querySelector(`div[data-id="${l.id}"]`)
          ?.classList.toggle('editor-layers__layer-selected', l.selected)
      }
    })
  }
}

export const addNewLayerFromCoworker = async (layer: any) => {
  if (
    Object.values(state.layers).length === 1 &&
    state.currentSelectedLayerId &&
    layer.order === state.layers[state.currentSelectedLayerId].order
  ) {
    if (Coworking.isHostingCoworking()) {
      state.layers[state.currentSelectedLayerId].order =
        state.layers[state.currentSelectedLayerId].order + 1
      state.layers[state.currentSelectedLayerId].name = state.layers[
        state.currentSelectedLayerId
      ].name.replace('1', '2')
      const layerOptionNameInput = refs.layersList?.querySelector(
        `div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-name input`
      ) as HTMLInputElement | null
      if (layerOptionNameInput) {
        layerOptionNameInput.value = state.layers[state.currentSelectedLayerId].name
      }
    } else {
      layer.order = layer.order + 1
      layer.name = layer.name.replace('1', '2')
    }
  }

  layer.canvas = createNewLayerCanvas()
  layer.history = new History(config.stepHistoryMaxLength, clearLayerHistoryStepBitmap)
  state.layers[layer.id] = layer
  createNewLayerDom(layer.id, true)
  reorderLayersList()
  addLayerHistoryNewStep(layer.id)
  ;(Object.values(state.layers) as any[]).forEach((l) => {
    if (!isYourLayerYours(l.id)) {
      l.selected = l.id === layer.id
      refs.layersList
        ?.querySelector(`div[data-id="${l.id}"]`)
        ?.classList.toggle('editor-layers__layer-selected', l.selected)
    }
  })
}

const addNewLayer = async (event?: Event) => {
  if (event) preventDefault(event)
  if (Object.keys(state.layers).length >= config.maxLayersNumber) {
    return
  }

  if (state.resizeMode) {
    await saveResizeModeIfNeeded()
  }

  const newLayerData = createNewLayerData()
  newLayerData.canvas = createNewLayerCanvas()

  state.layers[newLayerData.id] = newLayerData
  if (event) {
    addLayerHistoryNewStep(newLayerData.id)
  }
  await createNewLayerDom(newLayerData.id, true)
  reorderLayersList()
  await selectLayer(newLayerData.id)
  if (refs.layersList) refs.layersList.scrollTop = 0

  if (Coworking.isOpen()) {
    Coworking.sendNewLayer(newLayerData)
  }
}

const updateEditorCanvas = () => {
  if (state.currentSelectedLayerId && state.layers[state.currentSelectedLayerId]) {
    Editor.updateEditorLayer(
      parseInt(state.layers[state.currentSelectedLayerId].canvas.style.zIndex, 10),
      state.layers[state.currentSelectedLayerId].opacity,
      state.gcoMode ? 'source-atop' : 'source-over',
      state.layers[state.currentSelectedLayerId].active
    )
  }
}

const selectLayer = async (layerId: string) => {
  if (!state.layers[layerId]) return
  if (!isYourLayerYours(layerId)) {
    selectCoworkerLayer(layerId)
    return
  }

  if (layerId !== state.currentSelectedLayerId) {
    const wasInResizeMode = state.resizeMode

    if (state.currentSelectedLayerId) {
      if (state.resizeMode) {
        await saveResizeModeIfNeeded()
        const layerOptionButton = refs.layersList?.querySelector(
          `div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`
        )
        layerOptionButton?.classList.remove('disabled')
      }
    }

    filterYoursLayers().forEach((l: any) => {
      l.selected = l.id === layerId
      refs.layersList
        ?.querySelector(`div[data-id="${l.id}"]`)
        ?.classList.toggle('editor-layers__layer-selected', l.selected)
    })
    state.currentSelectedLayerId = layerId

    updateParamsByLayer(layerId)
    updateLayerPreview(layerId)
    updateEditorCanvas()
    Editor.setLayerContext(state.layers[layerId].canvas.context)
    if (state.resizeMode) {
      startResizeMode()
    } else if (wasInResizeMode) {
      endResizeMode()
    }

    if (Coworking.isOpen()) {
      Coworking.sendSelectedLayer(layerId)
    }
  }
}

const reorderLayersList = () => {
  ;(Object.values(state.layers) as any[])
    .sort((l1, l2) => (l1.order > l2.order ? 1 : -1))
    .forEach((layer, i) => {
      layer.order = i
      layer.canvas.style.zIndex = String(i * 10)
    })

  const layersCount = Object.keys(state.layers).length
  removeGlobalStatus('drawith__LAYERS_FULL')
  removeGlobalStatus('drawith__LAYERS_EMPTY')
  if (layersCount === config.maxLayersNumber) {
    addGlobalStatus('drawith__LAYERS_FULL')
  } else if (layersCount === 1) {
    addGlobalStatus('drawith__LAYERS_EMPTY')
  }

  if (refs.layersList) {
    Array.from(refs.layersList.children)
      .filter((l) => Boolean(state.layers[l.getAttribute('data-id') || '']))
      .sort((l1, l2) =>
        state.layers[l1.getAttribute('data-id') || ''].order <
        state.layers[l2.getAttribute('data-id') || ''].order
          ? 1
          : -1
      )
      .forEach((node) => refs.layersList?.appendChild(node))
  }
  updateEditorCanvas()
}

const isYourLayerYours = (layerId: string) => state.layers[layerId]?.owner === Coworking.getUserId()

const filterYoursLayers = () =>
  (Object.values(state.layers) as any[]).filter((l) => l.owner === Coworking.getUserId())

export const deleteLayerFromCoworker = (layerId: string, nextSelectedId: string) => {
  addLayerHistoryDeleteStep(layerId, nextSelectedId)
  _deleteLayer(layerId, nextSelectedId)
}

const _deleteLayer = async (
  layerId: string,
  nextSelectedId: string | 0 = 0,
  withAnimation = true
) => {
  const layer = state.layers[layerId]
  if (!layer) return
  if (layerId === state.currentSelectedLayerId && state.resizeMode) {
    updateResizeMode(false, false)
    Editor.hideDragBox()
  }
  refs.imageForResize = null
  if (nextSelectedId) {
    await selectLayer(nextSelectedId)
  } else if (layerId === state.currentSelectedLayerId) {
    state.currentSelectedLayerId = false
  }
  closeParams()
  const listEl = refs.layersList?.querySelector(`div[data-id="${layerId}"]`) as HTMLElement | null
  if (withAnimation) {
    fadeOutElements(layer.canvas)
    if (listEl) await removeOutElement(listEl)
  } else {
    layer.canvas.classList.add('displayNone')
    listEl?.remove()
  }
  layer.previewRef = null
  layer.canvas.remove()
  state.deletedLayers[layerId] = layer
  delete state.layers[layerId]
  updateUndoRedoButtons()
  reorderLayersList()
}

const deleteLayer = async (e: any, layerId = state.currentSelectedLayerId) => {
  preventDefault(e)
  if (paramsAreClosed() || !layerId) {
    return
  }
  openParams()
  let yoursLayers = filterYoursLayers()
  if (!isYourLayerYours(layerId) || yoursLayers.length <= 1) {
    return
  }

  yoursLayers = yoursLayers.filter((l: any) => l.id !== layerId)
  const maxOrder = Math.max(...yoursLayers.map((l: any) => l.order))
  const nextSelectedId = yoursLayers.filter((l: any) => l.order === maxOrder)[0].id
  if (Coworking.isOpen()) {
    Coworking.sendDeleteLayer(layerId, nextSelectedId)
  }
  addLayerHistoryDeleteStep(layerId, nextSelectedId)
  await _deleteLayer(layerId, nextSelectedId)
}

const findFirstLayerForUser = (userId = Coworking.getUserId()) => {
  return (Object.values(state.layers) as any[])
    .filter((l) => l.owner === userId)
    .sort((a, b) => b.order - a.order)[0]?.id
}

export const receiveLayerFromCoworker = (layerId: string) => {
  const layer = state.layers[layerId]
  if (!layer) return
  layer.history.clear()
  cleanGlobalLayersHistoryForLayer(layerId)
  layer.history = new History(config.stepHistoryMaxLength, clearLayerHistoryStepBitmap)
  layer.owner = Coworking.getUserId()
  const layerListElement = refs.layersList?.querySelector(`div[data-id="${layerId}"]`)
  layerListElement?.classList.remove('editor-layers__layer-coworker')
  layerListElement?.classList.add('editor-layers__layer-yours')
  layerListElement?.classList.remove('editor-layers__layer-selected')
}

const sendCurrentLayerToCoworker = async () => {
  if (
    state.currentSelectedLayerId &&
    Coworking.isOpen() &&
    isYourLayerYours(state.currentSelectedLayerId) &&
    state.layers[state.currentSelectedLayerId].active &&
    (await Messages.confirm(labels.areYouSureToSendLayer))
  ) {
    const layer = state.layers[state.currentSelectedLayerId]
    layer.history.clear()
    cleanGlobalLayersHistoryForLayer(state.currentSelectedLayerId)
    layer.history = new History(config.stepHistoryMaxLength, clearLayerHistoryStepBitmap)
    layer.owner = Coworking.getCoworkerUserId()
    Coworking.sendTransferLayer(state.currentSelectedLayerId)
    const layerListElement = refs.layersList?.querySelector(
      `div[data-id="${state.currentSelectedLayerId}"]`
    )
    layerListElement?.classList.add('editor-layers__layer-coworker')
    layerListElement?.classList.remove('editor-layers__layer-yours')
    layerListElement?.classList.remove('editor-layers__layer-selected')
    selectLayer(findFirstLayerForUser())
  }
}

export const renameLayerFromCoworker = (layerId: string, newName: string) => {
  const sanitized = String(newName || '').slice(0, MAX_LAYER_NAME_LENGTH)
  if (!sanitized) return
  addLayerHistoryRenameStep(layerId, sanitized, state.layers[layerId].name)
  saveLayerName(layerId, sanitized)
}

const renameLayer = async (e: any, layerId = state.currentSelectedLayerId) => {
  preventDefault(e)
  if (!layerId || paramsAreClosed() || !isYourLayerYours(layerId)) {
    return
  }
  openParams()
  const rawName = await Messages.input(
    `${labels.changeLayerName}: ${state.layers[layerId].name}`,
    state.layers[layerId].name
  )
  const newName = rawName ? rawName.trim().slice(0, MAX_LAYER_NAME_LENGTH) : ''
  if (newName && newName !== state.layers[layerId].name) {
    if (Coworking.isOpen()) {
      Coworking.sendRenameLayer(layerId, newName)
    }
    addLayerHistoryRenameStep(layerId, newName, state.layers[layerId].name)
    saveLayerName(layerId, newName)
  }
}

const saveLayerName = (layerId: string, newName: string) => {
  if (!state.layers[layerId]) return
  const clamped = String(newName || '').slice(0, MAX_LAYER_NAME_LENGTH)
  state.layers[layerId].name = clamped
  const input = refs.layersList?.querySelector(
    `div[data-id="${layerId}"] input`
  ) as HTMLInputElement | null
  if (input) input.value = clamped
}

export const duplicateLayerFromCoworker = (layerId: string, newId: string) => {
  addLayerHistoryDuplicateStep(layerId, newId)
  duplicateLayer(layerId, newId)
}

const duplicateLayer = async (layerId: string, newId: string) => {
  const newLayer = layerDeepCopy(state.layers[layerId])
  newLayer.canvas.context = getNewContextForCanvas(newLayer.canvas)
  const now = Date.now()
  newLayer.id = newId
  newLayer.selected = false
  newLayer.modified = true
  newLayer.createTimestamp = now
  newLayer.updateTimestamp = now
  newLayer.name = getNextLayerName()
  newLayer.history = new History(config.stepHistoryMaxLength, clearLayerHistoryStepBitmap)
  newLayer.active = true
  Object.keys(state.layers).forEach((id) => {
    if (state.layers[id].order >= newLayer.order) {
      state.layers[id].order++
    }
  })
  state.layers[newId] = newLayer
  await createNewLayerDom(newId, true)
  reorderLayersList()
}

const duplicateSelectedLayer = async (e: any) => {
  preventDefault(e)
  if (paramsAreClosed() || !state.currentSelectedLayerId) {
    return
  }
  openParams()
  if (
    refs.duplicateLayerButton?.classList.contains('disabled') ||
    !Number.isFinite(state.layers[state.currentSelectedLayerId].maxX) ||
    Object.keys(state.layers).length >= config.maxLayersNumber
  ) {
    return
  }

  await saveResizeModeIfNeeded()
  const newId = uuidv4()
  await duplicateLayer(state.currentSelectedLayerId, newId)
  refs.mergeDownLayerButton?.classList.remove('disabled')
  addLayerHistoryDuplicateStep(state.currentSelectedLayerId, newId)
  if (state.resizeMode) {
    startResizeMode()
  }
  if (Coworking.isOpen()) {
    Coworking.sendDuplicateLayer(state.currentSelectedLayerId, newId)
  }
}

export const mergeLayersFromCoworker = (
  layerOneId: string,
  layerTwoId: string,
  newLayerId: string
) => {
  addLayerHistoryMergeStep(layerOneId, layerTwoId, newLayerId)
  mergeLayers(layerOneId, layerTwoId, newLayerId, Coworking.getCoworkerUserId())
}

const mergeLayers = async (
  layerOneId: string,
  layerTwoId: string,
  newLayerId: string,
  ownerId = Coworking.getUserId()
) => {
  const layerOne = state.layers[layerOneId]
  const layerTwo = state.layers[layerTwoId]

  const newLayerData = createNewLayerData()
  newLayerData.id = newLayerId
  newLayerData.owner = ownerId
  newLayerData.order = layerTwo.order
  newLayerData.modified = true
  newLayerData.canvas = mergeImages([
    [layerTwo.canvas, layerTwo.opacity],
    [layerOne.canvas, layerOne.opacity],
  ])
  newLayerData.canvas.context = getNewContextForCanvas(newLayerData.canvas)
  state.layers[newLayerData.id] = newLayerData

  await updateLayerRealCoords(newLayerData.id)
  await createNewLayerDom(newLayerData.id, true)

  const elOne = refs.layersList?.querySelector(
    `div[data-id="${layerOne.id}"]`
  ) as HTMLElement | null
  const elTwo = refs.layersList?.querySelector(
    `div[data-id="${layerTwo.id}"]`
  ) as HTMLElement | null
  await Promise.all([
    fadeOutElements([state.layers[layerOne.id].canvas, state.layers[layerTwo.id].canvas]),
    elOne ? removeOutElement(elOne) : Promise.resolve(),
    elTwo ? removeOutElement(elTwo) : Promise.resolve(),
  ])

  state.layers[layerOne.id].previewRef = null
  state.layers[layerTwo.id].previewRef = null
  state.layers[layerOne.id].canvas.remove()
  state.layers[layerTwo.id].canvas.remove()
  state.deletedLayers[layerOne.id] = state.layers[layerOne.id]
  state.deletedLayers[layerTwo.id] = state.layers[layerTwo.id]
  delete state.layers[layerOne.id]
  delete state.layers[layerTwo.id]

  await selectLayer(newLayerData.id)
  reorderLayersList()
}

const mergeDownSelectedLayer = async (e: any) => {
  preventDefault(e)
  if (paramsAreClosed() || !state.currentSelectedLayerId) {
    return
  }
  openParams()

  const selectedLayer = state.layers[state.currentSelectedLayerId]
  const empty = !Number.isFinite(selectedLayer.minX)
  const canMergeDown =
    !empty &&
    selectedLayer.order > 0 &&
    (Object.values(state.layers) as any[]).find((l) => l.order === selectedLayer.order - 1)
      ?.owner === Coworking.getUserId()

  if (
    refs.mergeDownLayerButton?.classList.contains('disabled') ||
    !canMergeDown ||
    Object.keys(state.layers).length === 1
  ) {
    return
  }

  await saveResizeModeIfNeeded()
  const lowerLayer = (Object.values(state.layers) as any[]).find(
    (layer) => layer.order === selectedLayer.order - 1
  )

  if (lowerLayer) {
    closeParams()
    const newLayerId = uuidv4()
    await mergeLayers(state.currentSelectedLayerId, lowerLayer.id, newLayerId)
    addLayerHistoryMergeStep(selectedLayer.id, lowerLayer.id, newLayerId)
    if (Coworking.isOpen()) {
      Coworking.sendMergeDownLayer(selectedLayer.id, lowerLayer.id, newLayerId)
    }
    updateUndoRedoButtons()
    openParams()
  }
}

export const enableLayerFromCoworker = (layerId: string) => {
  enableLayer(layerId)
  addLayerHistoryEnableStep(layerId)
}

const enableLayer = (layerId = state.currentSelectedLayerId) => {
  const layer = state.layers[layerId]
  if (!layer) return
  layer.active = true
  refs.layersList
    ?.querySelector(`div[data-id="${layerId}"]`)
    ?.classList.add('editor-layers__layer-active')
  const layerOptionButton = refs.layersList?.querySelector(
    `div[data-id="${layerId}"] .editor-layers__layer-options-button`
  )
  layerOptionButton?.classList.add('svg-icon-visible')
  layerOptionButton?.classList.remove('svg-icon-hidden')

  fadeInElements(layer.canvas, { maxFadeIn: layer.opacity })
  if (layerId === state.currentSelectedLayerId) {
    const canBeResized = layerCanBeResized(layerId)
    updateEditorCanvas()
    updateResizeMode(false, canBeResized)
    updateGcoMode(false, canBeResized)
    refs.visibilityLayerButton?.classList.toggle('svg-icon-visible', layer.active)
    refs.visibilityLayerButton?.classList.toggle('svg-icon-hidden', !layer.active)
  }
}

export const disableLayerFromCoworker = (layerId: string) => {
  disableLayer(layerId)
  addLayerHistoryDisableStep(layerId)
}

const disableLayer = (layerId = state.currentSelectedLayerId) => {
  const layer = state.layers[layerId]
  if (!layer) return
  layer.active = false
  refs.layersList
    ?.querySelector(`div[data-id="${layerId}"]`)
    ?.classList.remove('editor-layers__layer-active')
  const layerOptionButton = refs.layersList?.querySelector(
    `div[data-id="${layerId}"] .editor-layers__layer-options-button`
  )
  layerOptionButton?.classList.add('svg-icon-hidden')
  layerOptionButton?.classList.remove('svg-icon-visible')

  fadeOutElements(layer.canvas, { maxFadeIn: layer.opacity })
  if (layerId === state.currentSelectedLayerId) {
    updateEditorCanvas()
    updateResizeMode(false, false)
    updateGcoMode(state.gcoMode, false)
    refs.visibilityLayerButton?.classList.toggle('svg-icon-visible', layer.active)
    refs.visibilityLayerButton?.classList.toggle('svg-icon-hidden', !layer.active)
  }
}

const toggleEnableLayer = (
  e: any,
  layerId = state.currentSelectedLayerId,
  clickedByList = false
) => {
  preventDefault(e)
  if (
    !layerId ||
    !isYourLayerYours(layerId) ||
    (!clickedByList && paramsAreClosed()) ||
    (layerId === state.currentSelectedLayerId && state.resizeMode)
  ) {
    return
  }
  if (state.layers[layerId].active) {
    disableLayer(layerId)
    addLayerHistoryDisableStep(layerId)
    if (Coworking.isOpen()) {
      Coworking.sendDisableLayer(layerId)
    }
  } else {
    enableLayer(layerId)
    addLayerHistoryEnableStep(layerId)
    if (Coworking.isOpen()) {
      Coworking.sendEnableLayer(layerId)
    }
  }
  updateParamsByLayer()
  if (state.resizeMode) {
    updateMagnetismCoords(state.currentSelectedLayerId)
  }
}

export const updateCanvasContent = (
  madeChanges: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  state.lastResizeCoords = { x, y, w, h, r }
  const minX = round(x - w / 2, 1)
  const minY = round(y - h / 2, 1)
  const rotation = convertAngleDegToRad(r)
  if (state.currentSelectedLayerId && refs.imageForResize) {
    fillCanvasWithImage(
      state.layers[state.currentSelectedLayerId].canvas.context,
      refs.imageForResize,
      minX,
      minY,
      w,
      h,
      rotation
    )
  }
  if (madeChanges) {
    Tools.toggleButton('undo', true)
    state.resizeModeMadeChanges = true
  }
}

export const updateMagnetismCoords = (
  layerId = state.currentSelectedLayerId,
  hasRotation = false
) => {
  state.magnetismCoords.x = getMagnetismCoordXForLayer(state, layerId, hasRotation)
  state.magnetismCoords.y = getMagnetismCoordYForLayer(state, layerId, hasRotation)
  if (hasRotation) {
    state.magnetismCoords.l =
      state.magnetismCoords.t =
      state.magnetismCoords.r =
      state.magnetismCoords.b =
        []
  } else {
    state.magnetismCoords.l = getMagnetismCoordLeftForLayer(state, layerId)
    state.magnetismCoords.t = getMagnetismCoordTopForLayer(state, layerId)
    state.magnetismCoords.r = getMagnetismCoordRightForLayer(state, layerId)
    state.magnetismCoords.b = getMagnetismCoordBottomForLayer(state, layerId)
  }
}

export const getMagnetismCoords = () => state.magnetismCoords

export const receiveResizeLayerFromCoworker = (
  layerId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  const layer = state.layers[layerId]
  if (!layer) return
  const [image] = cropImageWithMargin(
    layer.canvas,
    layer.minX,
    layer.minY,
    layer.maxX,
    layer.maxY,
    0
  )
  const minX = round(x - w / 2, 1)
  const minY = round(y - h / 2, 1)
  const rotation = convertAngleDegToRad(r)
  fillCanvasWithImage(layer.canvas.context, image, minX, minY, w, h, rotation)
  addLayerHistoryContentChangedStep(layerId)
}

const startResizeMode = () => {
  const layerOptionButton = refs.layersList?.querySelector(
    `div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`
  )
  layerOptionButton?.classList.add('disabled')
  updateResizeMode(true, true)
  updateGcoMode(state.gcoMode, false)
  state.resizeModeMadeChanges = false
  Tools.toggleButton('undo', false)
  Tools.toggleButton('redo', false)
  Tools.toggleButton('clear', false)
  refs.resizeButton?.classList.toggle('selected', state.resizeMode)
  refs.visibilityLayerButton?.classList.add('disabled')
  ColorPicker.deselectPipette(true, false, true)
  const layer = state.layers[state.currentSelectedLayerId]
  const [image, minX, minY, width, height] = cropImageWithMargin(
    layer.canvas,
    layer.minX,
    layer.minY,
    layer.maxX,
    layer.maxY,
    0
  )
  refs.imageForResize = image
  updateMagnetismCoords(state.currentSelectedLayerId)
  Editor.showDragBox(round(minX + width / 2, 1), round(minY + height / 2, 1), width, height, true)
}

const saveResizeModeIfNeeded = async () => {
  Editor.flushPendingResizeFrame()
  if (state.resizeModeMadeChanges) {
    await addLayerHistoryContentChangedStep()
    updateUndoRedoButtons()
    if (Coworking.isOpen() && state.currentSelectedLayerId) {
      Coworking.sendResizeLayer(
        state.currentSelectedLayerId,
        state.lastResizeCoords.x,
        state.lastResizeCoords.y,
        state.lastResizeCoords.w,
        state.lastResizeCoords.h,
        state.lastResizeCoords.r
      )
    }
  }
  state.resizeModeMadeChanges = false
  refs.imageForResize = null
}

const endResizeMode = async () => {
  if (!state.currentSelectedLayerId) return
  const canBeResized = layerCanBeResized(state.currentSelectedLayerId)
  const layerOptionButton = refs.layersList?.querySelector(
    `div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`
  )
  layerOptionButton?.classList.remove('disabled')
  updateResizeMode(false, canBeResized)
  updateGcoMode(state.gcoMode, canBeResized)
  Tools.toggleButton('clear', true)
  await saveResizeModeIfNeeded()
  refs.visibilityLayerButton?.classList.remove('disabled')
  refs.resizeButton?.classList.toggle('selected', state.resizeMode)
  state.lastResizeCoords = {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    r: 0,
  }
  Editor.hideDragBox()
  updateUndoRedoButtons()
}

export const closeResizeModeIfNeeded = () => {
  if (state && state.currentSelectedLayerId) {
    if (state.resizeMode) {
      endResizeMode()
    }
  }
}

export const updateCurrentTool = (isUsingEraser: boolean) => {
  if (state && state.currentSelectedLayerId) {
    state.editorIsUsingEraser = isUsingEraser
    updateGcoMode(state.gcoMode, layerCanBeResized(state.currentSelectedLayerId))
  }
}

export const receiveFlipLayerFromCoworker = (layerId: string, horizontally: boolean) => {
  const layer = state.layers[layerId]
  if (!layer) return
  const [content, x, y] = cropImageWithMargin(
    layer.canvas,
    layer.minX,
    layer.minY,
    layer.maxX,
    layer.maxY,
    0
  )
  fillCanvasWithImage(layer.canvas.context, flipImage(content, horizontally), x, y)
  addLayerHistoryContentChangedStep(layerId)
}

const flipLayer = async (e: any, layerId: string, horizontally: boolean) => {
  preventDefault(e)
  if (paramsAreClosed()) {
    return
  }
  openParams()
  const layer = state.layers[layerId]
  if (layer && Number.isFinite(layer.maxX)) {
    if (state.resizeMode && refs.imageForResize) {
      Editor.flushPendingResizeFrame()
      refs.imageForResize = flipImage(refs.imageForResize, horizontally)
      updateCanvasContent(
        true,
        state.lastResizeCoords.x,
        state.lastResizeCoords.y,
        state.lastResizeCoords.w,
        state.lastResizeCoords.h,
        state.lastResizeCoords.r
      )
    } else {
      const [content, x, y] = cropImageWithMargin(
        layer.canvas,
        layer.minX,
        layer.minY,
        layer.maxX,
        layer.maxY,
        0
      )
      fillCanvasWithImage(layer.canvas.context, flipImage(content, horizontally), x, y)
      await addLayerHistoryContentChangedStep()
      if (Coworking.isOpen()) {
        Coworking.sendFlipLayer(layerId, horizontally)
      }
    }
  }
}

const flipVertically = (e: any, layerId = state.currentSelectedLayerId) =>
  flipLayer(e, layerId, false)
const flipHorizontally = (e: any, layerId = state.currentSelectedLayerId) =>
  flipLayer(e, layerId, true)

const resizeButtonTouchStart = (e: any) => {
  preventDefault(e)
  closeParams()
  if (!refs.resizeButton?.classList.contains('disabled')) {
    if (state.resizeMode) {
      endResizeMode()
    } else {
      startResizeMode()
    }
  }
}

const gcoModeTouchStart = (e: any) => {
  preventDefault(e)
  closeParams()
  if (
    state.currentSelectedLayerId &&
    layerCanBeResized(state.currentSelectedLayerId) &&
    !state.resizeMode
  ) {
    updateGcoMode(!state.gcoMode, true)
  }
}

const updateResizeMode = (selected: boolean, active: boolean) => {
  refs.resizeButton?.classList.toggle('disabled', !active)
  if (selected !== state.resizeMode) {
    state.resizeMode = selected
    refs.resizeButton?.classList.toggle('selected', selected)
  }
}

const updateGcoMode = (selected: boolean, active: boolean) => {
  refs.gcoButton?.classList.toggle('disabled', !active || state.editorIsUsingEraser)
  if (selected !== state.gcoMode) {
    state.gcoMode = selected
    refs.gcoButton?.classList.remove(
      'png-icon-source-atop',
      'png-icon-source-over',
      'png-icon-source-over-atop'
    )
    refs.gcoButton?.classList.toggle('selected', selected)
    if (selected) {
      refs.gcoButton?.classList.add('png-icon-source-atop')
    } else {
      refs.gcoButton?.classList.add('png-icon-source-over')
    }
    updateEditorCanvas()
  }
}

export const updateLayerOpacityFromCoworker = (
  layerId: string,
  opacity: number,
  oldValue: number
) => {
  addLayerHistoryOpacityStep(layerId, opacity, oldValue)
  opacity = round(opacity / 100, 2)
  state.layers[layerId].opacity = opacity
  state.layers[layerId].canvas.style.opacity = String(opacity)
}

const _updateLayerOpacity = (layerId: string, opacity: number, inProgress = false) => {
  if (refs.opacityCursor) refs.opacityCursor.style.bottom = `${opacity}%`
  if (refs.opacityLabel) refs.opacityLabel.innerHTML = `${round(opacity, 0)}`
  if (refs.opacitySlider) {
    refs.opacitySlider.style.background = `linear-gradient(0deg, var(--palette-green-1) ${opacity}%, var(--palette-white) ${opacity}%)`
  }
  const normalizedOpacity = round(opacity / 100, 2)
  state.layers[layerId].opacity = normalizedOpacity
  state.layers[layerId].canvas.style.opacity = String(normalizedOpacity)

  if (!inProgress) {
    const canBeResized = layerCanBeResized(layerId)
    const wasInResizeMode = state.resizeMode
    updateResizeMode(state.resizeMode && canBeResized, canBeResized)
    updateGcoMode(state.gcoMode, !state.resizeMode && canBeResized)
    if (wasInResizeMode && !state.resizeMode) {
      endResizeMode()
    }
  }
  updateEditorCanvas()
}

const updateLayerOpacity = (() => {
  let startValue = 0
  return (opacity: number, inProgress: boolean, changed: boolean) => {
    if (paramsAreClosed() || !state.currentSelectedLayerId) {
      return
    }
    if (!changed) {
      startValue = state.layers[state.currentSelectedLayerId].opacity * 100
    }
    openParams()
    _updateLayerOpacity(state.currentSelectedLayerId, opacity, inProgress)
    if (!inProgress && opacity !== startValue) {
      addLayerHistoryOpacityStep(state.currentSelectedLayerId, opacity, startValue)
      if (Coworking.isOpen()) {
        Coworking.sendOpacityLayer(state.currentSelectedLayerId, opacity, startValue)
      }
    }
  }
})()

const updateParamsByLayer = (layerId = state.currentSelectedLayerId) => {
  if (layerId && isYourLayerYours(layerId)) {
    const layer = state.layers[layerId]
    const yourLayers = (Object.values(state.layers) as any[]).filter((l) => isYourLayerYours(l.id))
    const empty = !Number.isFinite(layer.minX)
    const canBeResized = layerCanBeResized(layerId)
    const canBeDeleted = yourLayers.length > 1
    const opacity = round(layer.opacity * 100, 0)
    const canMergeDown =
      !empty &&
      yourLayers.length > 1 &&
      layer.order > 0 &&
      (Object.values(state.layers) as any[]).find((l) => l.order === layer.order - 1)?.owner ===
        Coworking.getUserId()
    const canDuplicate = !empty && Object.values(state.layers).length < config.maxLayersNumber
    const canTransferLayer = Coworking.isOpen() && yourLayers.length > 1 && layer.active

    if (refs.opacityLabel) refs.opacityLabel.innerHTML = `${round(opacity, 0)}`
    if (refs.opacityCursor) refs.opacityCursor.style.bottom = `${opacity}%`
    if (refs.opacitySlider) {
      refs.opacitySlider.style.background = `linear-gradient(0deg, var(--palette-green-1) ${opacity}%, var(--palette-white) ${opacity}%)`
    }
    refs.duplicateLayerButton?.classList.toggle('disabled', !canDuplicate)
    refs.deleteLayerButton?.classList.toggle('disabled', !canBeDeleted)
    refs.mergeDownLayerButton?.classList.toggle('disabled', !canMergeDown)
    refs.flipVerticalButton?.classList.toggle('disabled', empty)
    refs.flipHorizontalButton?.classList.toggle('disabled', empty)
    refs.sendLayerButton?.classList.toggle('disabled', !canTransferLayer)
    const wasInResizeMode = state.resizeMode
    updateResizeMode(state.resizeMode && canBeResized, canBeResized)
    updateGcoMode(state.gcoMode && canBeResized, !state.resizeMode && canBeResized)
    if (wasInResizeMode && !state.resizeMode) {
      Editor.hideDragBox()
    }
    refs.visibilityLayerButton?.classList.toggle('svg-icon-visible', layer.active)
    refs.visibilityLayerButton?.classList.toggle('svg-icon-hidden', !layer.active)
  }
}

export const layerDragChangeFromCoworker = (
  layerId: string,
  newOrder: number,
  oldOrder: number
) => {
  addLayerHistoryOrderStep(layerId, newOrder, oldOrder)
  updateLayerOrger(layerId, newOrder)
}

const updateLayerOrger = (layerId: string, newOrder: number) => {
  if (!state.layers[layerId]) return
  const layers = Object.values(state.layers) as any[]
  const currentLayerOrder = state.layers[layerId].order
  if (currentLayerOrder === newOrder) return

  if (currentLayerOrder > newOrder) {
    layers.forEach((layer) => {
      if (layer.id !== layerId && layer.order >= newOrder && layer.order < currentLayerOrder) {
        layer.order++
      }
    })
  } else {
    layers.forEach((layer) => {
      if (layer.id !== layerId && layer.order > currentLayerOrder && layer.order <= newOrder) {
        layer.order--
      }
    })
  }
  state.layers[layerId].order = newOrder
  reorderLayersList()
}

const onListDragChange = (draggedElement: HTMLElement, domOrder: number, inProgress = true) => {
  const layerId = draggedElement.getAttribute('data-id')
  if (!layerId) return
  const layers = Object.values(state.layers)
  const newOrder = layers.length - 1 - domOrder

  if (!inProgress) {
    if (newOrder !== state.listDragStartIndex) {
      addLayerHistoryOrderStep(layerId, newOrder, state.listDragStartIndex)
      if (Coworking.isOpen()) {
        Coworking.sendOrderDragLayer(layerId, newOrder, state.listDragStartIndex)
      }
    }
    state.listDragStartIndex = -1
  }

  updateLayerOrger(layerId, newOrder)
}

const startDragLayer = (e: any, layerListDom: HTMLElement) => {
  closeParams()
  const id = layerListDom.getAttribute('data-id')
  if (!id || !refs.layersList) return
  state.listDragStartIndex = state.layers[id].order
  handleElementsListDragAndDrop(e, refs.layersList, layerListDom, onListDragChange, 'vertical')
}

const findListTargetLayerParent = (target: any): HTMLElement | false => {
  if (!target || target === refs.layersList) return false
  while (target && !target.classList?.contains('editor-layers__layer')) {
    target = target.parentNode
    if (!target || target === refs.layersList) return false
  }
  return target || false
}

const onLayerTouchDown = (layerId: string) => {
  if (isYourLayerYours(layerId)) {
    if (layerId === state.currentSelectedLayerId) {
      updateParamsByLayer(layerId)
      toggleParams()
    } else {
      selectLayer(layerId)
      openParams()
    }
  }
}

const onListClick = (e: any) => {
  const layerListDom = findListTargetLayerParent(e.target)
  if (layerListDom) {
    const id = layerListDom.getAttribute('data-id')
    if (!id) return
    if (
      e.target === layerListDom ||
      e.target.classList.contains('editor-layers__layer-preview') ||
      e.target.nodeName.toLowerCase() === 'input'
    ) {
      onLayerTouchDown(id)
    } else if (e.target.classList.contains('editor-layers__layer-options-button')) {
      toggleEnableLayer(e, id, true)
    }
  }
}

const onListLongPress = async (e: any) => {
  e.preventDefault()
  if (Object.keys(state.layers).length > 1) {
    const layerListDom = findListTargetLayerParent(e.target)
    if (layerListDom) {
      const id = layerListDom.getAttribute('data-id')
      if (id) {
        await selectLayer(id)
        startDragLayer(e, layerListDom)
      }
    }
  }
}

const onContainerTouchStart = (e: any) => {
  if (e.target === refs.layersContainer) {
    preventDefault(e)
  }
}

const prepareLayerFromDb = async (l: any) => {
  const layer = layerDeepCopy(l, { deepCopyCanvas: false })
  layer.modified = false
  layer.owner = Coworking.getUserId()
  layer.canvas = await getCanvasFromBase64(l.base64)
  layer.canvas.context = getNewContextForCanvas(layer.canvas)
  layer.history = new History(config.stepHistoryMaxLength, clearLayerHistoryStepBitmap)
  return layer
}

const initLayers = async (initialLayers: any[], canvasWidth: number, canvasHeight: number) => {
  state.canvases.width = canvasWidth
  state.canvases.height = canvasHeight
  closeParams()

  if (initialLayers && initialLayers.length) {
    const prepared = await parallelize(
      initialLayers,
      prepareLayerFromDb,
      config.maxConcurrentThreads
    )
    state.layers = Object.fromEntries(prepared.map((l: any) => [l.id, l]))
    const layersIds = Object.keys(state.layers)
    await Promise.all(layersIds.map((id) => createNewLayerDom(id, false)))
    await selectLayer(layersIds.find((layerId) => state.layers[layerId].selected) || layersIds[0])
    reorderLayersList()
  } else {
    addNewLayer()
  }
}

const initHistories = (coworkersId: string[] = []) => {
  const usersId = [Coworking.getUserId(), ...coworkersId.filter(Boolean)]
  const maxHistorySteps = Math.trunc(config.stepHistoryMaxLength / usersId.length) + 1

  UsersLayersHistory = Object.fromEntries(
    usersId.map((userId) => {
      const userHistory = new History(maxHistorySteps)
      userHistory.add({
        type: 'init',
      })

      return [userId, userHistory]
    })
  )
}

const initDom = async (moduleContainer: HTMLElement) => {
  const dom = (await loadTemplate(
    tplLayers,
    {
      maxLength: MAX_LAYER_NAME_LENGTH,
    },
    moduleContainer
  )) as HTMLElement[]
  refs.layersContainer = dom[0]
  refs.paramsContainer = dom[1]
  refs.resizeButton = dom[2]
  refs.gcoButton = createDom('png-icon-source-over')
  refs.layersList = refs.layersContainer.querySelector('.editor-layers__list')
  refs.addNewLayerButton = refs.layersContainer.querySelector('.editor-layers__add-new')
  refs.layerListElement = refs.layersContainer.querySelector('.editor-layers__layer')
  refs.visibilityLayerButton = refs.paramsContainer.querySelector(
    '.editor-layers__params-visibility'
  )
  refs.editLayerNameButton = refs.paramsContainer.querySelector('.editor-layers__params-name')
  refs.duplicateLayerButton = refs.paramsContainer.querySelector('.editor-layers__params-duplicate')
  refs.mergeDownLayerButton = refs.paramsContainer.querySelector(
    '.editor-layers__params-merge-down'
  )
  refs.flipVerticalButton = refs.paramsContainer.querySelector(
    '.editor-layers__params-flip-vertical'
  )
  refs.flipHorizontalButton = refs.paramsContainer.querySelector(
    '.editor-layers__params-flip-horizontal'
  )
  refs.sendLayerButton = refs.paramsContainer.querySelector('.editor-layers__params-send')
  refs.deleteLayerButton = refs.paramsContainer.querySelector('.editor-layers__params-delete')
  refs.opacitySlider = refs.paramsContainer.querySelector('.editor-layers__opacity-slider')
  refs.opacityCursor = refs.opacitySlider?.querySelector('div') || null
  refs.opacityLabel = refs.opacitySlider?.querySelector('span') || null
  refs.resizeButton.classList.toggle('selected', state.resizeMode)

  refs.layerListElement?.remove()
  refs.paramsContainer.addEventListener(Params.eventStart, preventDefault)
  refs.gcoButton.addEventListener(Params.eventStart, gcoModeTouchStart)
  refs.resizeButton.addEventListener(Params.eventStart, resizeButtonTouchStart)
  refs.layersContainer.addEventListener(Params.eventStart, onContainerTouchStart)
  refs.addNewLayerButton?.addEventListener(Params.eventStart, addNewLayer)
  refs.flipVerticalButton?.addEventListener(Params.eventStart, flipVertically)
  refs.flipHorizontalButton?.addEventListener(Params.eventStart, flipHorizontally)
  refs.visibilityLayerButton?.addEventListener(Params.eventStart, toggleEnableLayer)
  refs.editLayerNameButton?.addEventListener(Params.eventStart, renameLayer)
  refs.duplicateLayerButton?.addEventListener(Params.eventStart, duplicateSelectedLayer)
  refs.mergeDownLayerButton?.addEventListener(Params.eventStart, mergeDownSelectedLayer)
  refs.deleteLayerButton?.addEventListener(Params.eventStart, deleteLayer)
  refs.sendLayerButton?.addEventListener(Params.eventStart, sendCurrentLayerToCoworker)
  if (refs.layersList) {
    addListScrollClickAndPressHandlers(refs.layersList, onListClick, onListLongPress)
  }
  if (refs.opacityCursor && refs.opacitySlider) {
    addVerticalDragSliderHandler(
      refs.opacityCursor,
      refs.opacitySlider,
      updateLayerOpacity,
      100,
      0,
      false,
      0
    )
  }
  Toolbar.addOptionButtonsGroup([refs.resizeButton, refs.gcoButton])
}

export const init = async (
  moduleContainer: HTMLElement,
  initialLayers: any[],
  canvasWidth: number,
  canvasHeight: number,
  coworkersId: string[] = []
) => {
  initHistories(coworkersId)

  config.maxLayersNumber = config.maxLayersNumberHighPerf
  if (Params.isTablet && Params.ios) {
    const screenMaxSize = getRealScreenMaxSize()
    if (screenMaxSize < 2200) {
      config.maxLayersNumber = config.maxLayersNumberMediumPerf
    }
  }
  state = deepCopy(initialState)
  await initDom(moduleContainer)
  if (refs.layersList) refs.layersList.scrollTop = 1
  await initLayers(initialLayers, canvasWidth, canvasHeight)

  setTimeout(() => {
    if (refs.layersList) {
      const selected = refs.layersList.querySelector(
        '.editor-layers__layer-selected'
      ) as HTMLElement | null
      refs.layersList.scrollTop = selected?.offsetTop || 0
    }
  }, 200)
}

const clearLayerHistoryStepBitmap = (step: any) => {
  if (step?.bitmap) {
    step.bitmap.close()
    delete step.bitmap
  }
}

const hardDeleteLayer = (layerId: string, clearHistory = true) => {
  const layer = state.layers?.[layerId] || state.deletedLayers?.[layerId]
  if (layer) {
    if (clearHistory && layer.history) {
      layer.history.clear()
      layer.history = undefined
    }
    if (layer.canvas) {
      layer.canvas.remove()
      layer.canvas.width = layer.canvas.height = 0
      layer.canvas = undefined
    }

    if (state.layers) delete state.layers[layerId]
    if (state.deletedLayers) delete state.deletedLayers[layerId]
  }
}

export const remove = (isSavingLayers = false) => {
  if (state.layers) {
    Object.values(state.layers).forEach((layer: any) => hardDeleteLayer(layer.id, !isSavingLayers))
  }
  if (state.deletedLayers) {
    Object.values(state.deletedLayers).forEach((layer: any) => hardDeleteLayer(layer.id, true))
  }
  Object.values(UsersLayersHistory).forEach((userHistory) => userHistory.clear())
  UsersLayersHistory = {}
  cleanRefs(refs)
  state = {}
}
