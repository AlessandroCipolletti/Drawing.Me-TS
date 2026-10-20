import { v4 as uuidv4 } from 'uuid'
import History from 'modules/History'
import * as Coworking from 'modules/Coworking'
import * as Messages from 'modules/Messages'
import { editorFacade } from 'pages/Editor/editorFacade'
import { preventDefault } from 'utils/domUtils'
import { removeOutElement, fadeOutElements, fadeInElements } from 'utils/animationsUtils'
import { mergeImages } from 'utils/imageUtils'
import { getNewContextForCanvas } from 'utils/canvasUtils'
import { parallelize } from 'utils/jsUtils'
import {
  MAX_LAYER_NAME_LENGTH,
  config,
  labels,
  state,
  refs,
  clearLayerHistoryStepBitmap,
  createNewLayerCanvas,
  createNewLayerData,
  filterYoursLayers,
  getNextLayerName,
  isYourLayerYours,
  layerCanBeResized,
  LayerCanvasElement,
  LayerHistoryStep,
  LayerRecord,
  updateMagnetismCoords,
} from './layersState'
import {
  createNewLayerDom,
  layerDeepCopy,
  prepareLayerFromDb,
  reorderLayersList,
  updateLayerPreview,
  updateLayerRealCoords,
} from './layersExport'
import {
  addLayerHistoryContentChangedStep,
  addLayerHistoryDeleteStep,
  addLayerHistoryDisableStep,
  addLayerHistoryDuplicateStep,
  addLayerHistoryEnableStep,
  addLayerHistoryMergeStep,
  addLayerHistoryNewStep,
  addLayerHistoryRenameStep,
  updateUndoRedoButtons,
} from './layersHistory'
import {
  closeParams,
  endResizeMode,
  openParams,
  paramsAreClosed,
  saveResizeModeIfNeeded,
  startResizeMode,
  updateEditorCanvas,
  updateGcoMode,
  updateParamsByLayer,
  updateResizeMode,
} from './layersListUi'
import { selectCoworkerLayer } from './layersCoworking'

export const selectLayer = async (layerId: string) => {
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

    filterYoursLayers().forEach((l) => {
      l.selected = l.id === layerId
      refs.layersList
        ?.querySelector(`div[data-id="${l.id}"]`)
        ?.classList.toggle('editor-layers__layer-selected', l.selected)
    })
    state.currentSelectedLayerId = layerId

    updateParamsByLayer(layerId)
    updateLayerPreview(layerId)
    updateEditorCanvas()
    editorFacade.setLayerContext(state.layers[layerId].canvas.context)
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

export const _deleteLayer = async (
  layerId: string,
  nextSelectedId: string | 0 = 0,
  withAnimation = true
) => {
  const layer = state.layers[layerId]
  if (!layer) return
  if (layerId === state.currentSelectedLayerId && state.resizeMode) {
    updateResizeMode(false, false)
    editorFacade.hideDragBox()
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

export const deleteLayer = async (
  e?: Event,
  layerId: string | false = state.currentSelectedLayerId
) => {
  if (e) preventDefault(e)
  if (paramsAreClosed() || !layerId) {
    return
  }
  openParams()
  let yoursLayers = filterYoursLayers()
  if (!isYourLayerYours(layerId) || yoursLayers.length <= 1) {
    return
  }

  yoursLayers = yoursLayers.filter((l) => l.id !== layerId)
  const maxOrder = Math.max(...yoursLayers.map((l) => l.order))
  const nextSelectedId = yoursLayers.filter((l) => l.order === maxOrder)[0].id
  if (Coworking.isOpen()) {
    Coworking.sendDeleteLayer(layerId, nextSelectedId)
  }
  addLayerHistoryDeleteStep(layerId, nextSelectedId)
  await _deleteLayer(layerId, nextSelectedId)
}

export const saveLayerName = (layerId: string, newName: string) => {
  if (!state.layers[layerId]) return
  const clamped = String(newName || '').slice(0, MAX_LAYER_NAME_LENGTH)
  state.layers[layerId].name = clamped
  const input = refs.layersList?.querySelector(
    `div[data-id="${layerId}"] input`
  ) as HTMLInputElement | null
  if (input) input.value = clamped
}

export const renameLayer = async (
  e?: Event,
  layerId: string | false = state.currentSelectedLayerId
) => {
  if (e) preventDefault(e)
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

export const duplicateLayer = async (layerId: string, newId: string) => {
  const newLayer = layerDeepCopy(state.layers[layerId]) as unknown as LayerRecord
  newLayer.canvas.context = getNewContextForCanvas(newLayer.canvas)
  const now = Date.now()
  newLayer.id = newId
  newLayer.selected = false
  newLayer.modified = true
  newLayer.createTimestamp = now
  newLayer.updateTimestamp = now
  newLayer.name = getNextLayerName()
  newLayer.history = new History<LayerHistoryStep>(
    config.stepHistoryMaxLength,
    clearLayerHistoryStepBitmap
  )
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

export const duplicateSelectedLayer = async (e?: Event) => {
  if (e) preventDefault(e)
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

export const mergeLayers = async (
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
  ]) as LayerCanvasElement
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

export const mergeDownSelectedLayer = async (e?: Event) => {
  if (e) preventDefault(e)
  if (paramsAreClosed() || !state.currentSelectedLayerId) {
    return
  }
  openParams()

  const selectedLayer = state.layers[state.currentSelectedLayerId]
  const empty = !Number.isFinite(selectedLayer.minX)
  const canMergeDown =
    !empty &&
    selectedLayer.order > 0 &&
    Object.values(state.layers).find((l) => l.order === selectedLayer.order - 1)?.owner ===
      Coworking.getUserId()

  if (
    refs.mergeDownLayerButton?.classList.contains('disabled') ||
    !canMergeDown ||
    Object.keys(state.layers).length === 1
  ) {
    return
  }

  await saveResizeModeIfNeeded()
  const lowerLayer = Object.values(state.layers).find(
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

export const enableLayer = (layerId: string | false = state.currentSelectedLayerId) => {
  if (!layerId) return
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

export const disableLayer = (layerId: string | false = state.currentSelectedLayerId) => {
  if (!layerId) return
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

export const toggleEnableLayer = (
  e?: Event,
  layerId: string | false = state.currentSelectedLayerId,
  clickedByList = false
) => {
  if (e) preventDefault(e)
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

export const clearLayer = (layerId: string) => {
  const layer = state.layers[layerId]
  if (!layer) return
  layer.canvas.context.clearRect(0, 0, state.canvases.width, state.canvases.height)
  layer.minX = Infinity
  layer.minY = Infinity
  layer.maxY = -Infinity
  layer.maxX = -Infinity
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

export const addNewLayer = async (event?: Event) => {
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

export const initLayers = async (
  initialLayers: unknown[],
  canvasWidth: number,
  canvasHeight: number
) => {
  state.canvases.width = canvasWidth
  state.canvases.height = canvasHeight
  closeParams()

  if (initialLayers && initialLayers.length) {
    const prepared = await parallelize(
      initialLayers as Array<LayerRecord & { base64: string }>,
      prepareLayerFromDb,
      config.maxConcurrentThreads
    )
    state.layers = Object.fromEntries(prepared.map((l) => [l.id, l]))
    const layersIds = Object.keys(state.layers)
    await Promise.all(layersIds.map((id) => createNewLayerDom(id, false)))
    await selectLayer(layersIds.find((layerId) => state.layers[layerId].selected) || layersIds[0])
    reorderLayersList()
  } else {
    await addNewLayer()
  }
}
