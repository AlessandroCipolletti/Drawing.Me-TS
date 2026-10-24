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
import { layersBridge, registerLayersBridge } from './layersBridge'

const selectLayer = async (layerId: string) => {
  if (!state.layers[layerId]) return
  if (!isYourLayerYours(layerId)) {
    layersBridge.selectCoworkerLayer(layerId)
    return
  }

  if (layerId !== state.currentSelectedLayerId) {
    const wasInResizeMode = state.resizeMode

    if (state.currentSelectedLayerId) {
      if (state.resizeMode) {
        await layersBridge.saveResizeModeIfNeeded()
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

    layersBridge.updateParamsByLayer(layerId)
    layersBridge.updateLayerPreview(layerId)
    layersBridge.updateEditorCanvas()
    editorFacade.setLayerContext(state.layers[layerId].canvas.context)
    if (state.resizeMode) {
      layersBridge.startResizeMode()
    } else if (wasInResizeMode) {
      layersBridge.endResizeMode()
    }

    if (Coworking.isOpen()) {
      Coworking.sendSelectedLayer(layerId)
    }
  }
}

const _deleteLayer = async (
  layerId: string,
  nextSelectedId: string | 0 = 0,
  withAnimation = true
) => {
  const layer = state.layers[layerId]
  if (!layer) return
  if (layerId === state.currentSelectedLayerId && state.resizeMode) {
    layersBridge.updateResizeMode(false, false)
    editorFacade.hideDragBox()
  }
  refs.imageForResize = null
  if (nextSelectedId) {
    await selectLayer(nextSelectedId)
  } else if (layerId === state.currentSelectedLayerId) {
    state.currentSelectedLayerId = false
  }
  layersBridge.closeParams()
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
  layersBridge.updateUndoRedoButtons()
  layersBridge.reorderLayersList()
}

export const deleteLayer = async (
  e?: Event,
  layerId: string | false = state.currentSelectedLayerId
) => {
  if (e) preventDefault(e)
  if (layersBridge.paramsAreClosed() || !layerId) {
    return
  }
  layersBridge.openParams()
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
  layersBridge.addLayerHistoryDeleteStep(layerId, nextSelectedId)
  await _deleteLayer(layerId, nextSelectedId)
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

export const renameLayer = async (
  e?: Event,
  layerId: string | false = state.currentSelectedLayerId
) => {
  if (e) preventDefault(e)
  if (!layerId || layersBridge.paramsAreClosed() || !isYourLayerYours(layerId)) {
    return
  }
  layersBridge.openParams()
  const rawName = await Messages.input(
    `${labels.changeLayerName}: ${state.layers[layerId].name}`,
    state.layers[layerId].name
  )
  const newName = rawName ? rawName.trim().slice(0, MAX_LAYER_NAME_LENGTH) : ''
  if (newName && newName !== state.layers[layerId].name) {
    if (Coworking.isOpen()) {
      Coworking.sendRenameLayer(layerId, newName)
    }
    layersBridge.addLayerHistoryRenameStep(layerId, newName, state.layers[layerId].name)
    saveLayerName(layerId, newName)
  }
}

const duplicateLayer = async (layerId: string, newId: string) => {
  const newLayer = layersBridge.layerDeepCopy(state.layers[layerId]) as unknown as LayerRecord
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
  await layersBridge.createNewLayerDom(newId, true)
  layersBridge.reorderLayersList()
}

export const duplicateSelectedLayer = async (e?: Event) => {
  if (e) preventDefault(e)
  if (layersBridge.paramsAreClosed() || !state.currentSelectedLayerId) {
    return
  }
  layersBridge.openParams()
  if (
    refs.duplicateLayerButton?.classList.contains('disabled') ||
    !Number.isFinite(state.layers[state.currentSelectedLayerId].maxX) ||
    Object.keys(state.layers).length >= config.maxLayersNumber
  ) {
    return
  }

  await layersBridge.saveResizeModeIfNeeded()
  const newId = uuidv4()
  await duplicateLayer(state.currentSelectedLayerId, newId)
  refs.mergeDownLayerButton?.classList.remove('disabled')
  layersBridge.addLayerHistoryDuplicateStep(state.currentSelectedLayerId, newId)
  if (state.resizeMode) {
    layersBridge.startResizeMode()
  }
  if (Coworking.isOpen()) {
    Coworking.sendDuplicateLayer(state.currentSelectedLayerId, newId)
  }
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
  ]) as LayerCanvasElement
  newLayerData.canvas.context = getNewContextForCanvas(newLayerData.canvas)
  state.layers[newLayerData.id] = newLayerData

  await layersBridge.updateLayerRealCoords(newLayerData.id)
  await layersBridge.createNewLayerDom(newLayerData.id, true)

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
  layersBridge.reorderLayersList()
}

export const mergeDownSelectedLayer = async (e?: Event) => {
  if (e) preventDefault(e)
  if (layersBridge.paramsAreClosed() || !state.currentSelectedLayerId) {
    return
  }
  layersBridge.openParams()

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

  await layersBridge.saveResizeModeIfNeeded()
  const lowerLayer = Object.values(state.layers).find(
    (layer) => layer.order === selectedLayer.order - 1
  )

  if (lowerLayer) {
    layersBridge.closeParams()
    const newLayerId = uuidv4()
    await mergeLayers(state.currentSelectedLayerId, lowerLayer.id, newLayerId)
    layersBridge.addLayerHistoryMergeStep(selectedLayer.id, lowerLayer.id, newLayerId)
    if (Coworking.isOpen()) {
      Coworking.sendMergeDownLayer(selectedLayer.id, lowerLayer.id, newLayerId)
    }
    layersBridge.updateUndoRedoButtons()
    layersBridge.openParams()
  }
}

const enableLayer = (layerId: string | false = state.currentSelectedLayerId) => {
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
    layersBridge.updateEditorCanvas()
    layersBridge.updateResizeMode(false, canBeResized)
    layersBridge.updateGcoMode(false, canBeResized)
    refs.visibilityLayerButton?.classList.toggle('svg-icon-visible', layer.active)
    refs.visibilityLayerButton?.classList.toggle('svg-icon-hidden', !layer.active)
  }
}

const disableLayer = (layerId: string | false = state.currentSelectedLayerId) => {
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
    layersBridge.updateEditorCanvas()
    layersBridge.updateResizeMode(false, false)
    layersBridge.updateGcoMode(state.gcoMode, false)
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
    (!clickedByList && layersBridge.paramsAreClosed()) ||
    (layerId === state.currentSelectedLayerId && state.resizeMode)
  ) {
    return
  }
  if (state.layers[layerId].active) {
    disableLayer(layerId)
    layersBridge.addLayerHistoryDisableStep(layerId)
    if (Coworking.isOpen()) {
      Coworking.sendDisableLayer(layerId)
    }
  } else {
    enableLayer(layerId)
    layersBridge.addLayerHistoryEnableStep(layerId)
    if (Coworking.isOpen()) {
      Coworking.sendEnableLayer(layerId)
    }
  }
  layersBridge.updateParamsByLayer()
  if (state.resizeMode) {
    updateMagnetismCoords(state.currentSelectedLayerId)
  }
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

export const clearCurrentLayer = async (): Promise<boolean> => {
  layersBridge.closeParams()
  layersBridge.updateGcoMode(false, false)
  if (
    state.currentSelectedLayerId &&
    Number.isFinite(state.layers[state.currentSelectedLayerId].maxX)
  ) {
    clearLayer(state.currentSelectedLayerId)
    layersBridge.addLayerHistoryContentChangedStep(state.currentSelectedLayerId)
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
    await layersBridge.saveResizeModeIfNeeded()
  }

  const newLayerData = createNewLayerData()
  newLayerData.canvas = createNewLayerCanvas()

  state.layers[newLayerData.id] = newLayerData
  if (event) {
    layersBridge.addLayerHistoryNewStep(newLayerData.id)
  }
  await layersBridge.createNewLayerDom(newLayerData.id, true)
  layersBridge.reorderLayersList()
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
  layersBridge.closeParams()

  if (initialLayers && initialLayers.length) {
    const prepared = await parallelize(
      initialLayers as Array<LayerRecord & { base64: string }>,
      layersBridge.prepareLayerFromDb,
      config.maxConcurrentThreads
    )
    state.layers = Object.fromEntries(prepared.map((l) => [l.id, l]))
    const layersIds = Object.keys(state.layers)
    await Promise.all(layersIds.map((id) => layersBridge.createNewLayerDom(id, false)))
    await selectLayer(layersIds.find((layerId) => state.layers[layerId].selected) || layersIds[0])
    layersBridge.reorderLayersList()
  } else {
    await addNewLayer()
  }
}

registerLayersBridge({
  selectLayer,
  _deleteLayer,
  clearLayer,
  disableLayer,
  duplicateLayer,
  enableLayer,
  mergeLayers,
  saveLayerName,
  toggleEnableLayer,
})
