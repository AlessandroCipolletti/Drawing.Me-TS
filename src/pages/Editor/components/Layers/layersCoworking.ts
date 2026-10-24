import History from 'modules/History'
import * as Coworking from 'modules/Coworking'
import * as Messages from 'modules/Messages'
import { round, convertAngleDegToRad } from 'utils/mathUtils'
import { cropImageWithMargin, flipImage } from 'utils/imageUtils'
import { fillCanvasWithImage } from 'utils/canvasUtils'
import {
  MAX_LAYER_NAME_LENGTH,
  config,
  labels,
  state,
  refs,
  clearLayerHistoryStepBitmap,
  createNewLayerCanvas,
  findFirstLayerForUser,
  isYourLayerYours,
  LayerHistoryStep,
  LayerRecord,
} from './layersState'
import { layersBridge, registerLayersBridge } from './layersBridge'

export const selectCoworkerLayer = (layerId: string) => {
  if (state?.layers?.[layerId] && !isYourLayerYours(layerId)) {
    Object.values(state.layers).forEach((l) => {
      if (!isYourLayerYours(l.id)) {
        l.selected = l.id === layerId
        refs.layersList
          ?.querySelector(`div[data-id="${l.id}"]`)
          ?.classList.toggle('editor-layers__layer-selected', l.selected)
      }
    })
  }
}

export const addNewLayerFromCoworker = async (layer: LayerRecord) => {
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
  layer.history = new History<LayerHistoryStep>(
    config.stepHistoryMaxLength,
    clearLayerHistoryStepBitmap
  )
  state.layers[layer.id] = layer
  await layersBridge.createNewLayerDom(layer.id, true)
  layersBridge.reorderLayersList()
  layersBridge.addLayerHistoryNewStep(layer.id)
  Object.values(state.layers).forEach((l) => {
    if (!isYourLayerYours(l.id)) {
      l.selected = l.id === layer.id
      refs.layersList
        ?.querySelector(`div[data-id="${l.id}"]`)
        ?.classList.toggle('editor-layers__layer-selected', l.selected)
    }
  })
}

export const clearLayerFromCoworker = (layerId: string) => {
  layersBridge.clearLayer(layerId)
  layersBridge.addLayerHistoryContentChangedStep(layerId)
}

export const deleteLayerFromCoworker = (layerId: string, nextSelectedId: string) => {
  layersBridge.addLayerHistoryDeleteStep(layerId, nextSelectedId)
  layersBridge._deleteLayer(layerId, nextSelectedId)
}

export const receiveLayerFromCoworker = (layerId: string) => {
  const layer = state.layers[layerId]
  if (!layer) return
  layer.history.clear()
  layersBridge.cleanGlobalLayersHistoryForLayer(layerId)
  layer.history = new History<LayerHistoryStep>(
    config.stepHistoryMaxLength,
    clearLayerHistoryStepBitmap
  )
  layer.owner = Coworking.getUserId()
  const layerListElement = refs.layersList?.querySelector(`div[data-id="${layerId}"]`)
  layerListElement?.classList.remove('editor-layers__layer-coworker')
  layerListElement?.classList.add('editor-layers__layer-yours')
  layerListElement?.classList.remove('editor-layers__layer-selected')
}

export const sendCurrentLayerToCoworker = async () => {
  if (
    state.currentSelectedLayerId &&
    Coworking.isOpen() &&
    isYourLayerYours(state.currentSelectedLayerId) &&
    state.layers[state.currentSelectedLayerId].active &&
    (await Messages.confirm(labels.areYouSureToSendLayer))
  ) {
    const layer = state.layers[state.currentSelectedLayerId]
    layer.history.clear()
    layersBridge.cleanGlobalLayersHistoryForLayer(state.currentSelectedLayerId)
    layer.history = new History<LayerHistoryStep>(
      config.stepHistoryMaxLength,
      clearLayerHistoryStepBitmap
    )
    layer.owner = Coworking.getCoworkerUserId()
    Coworking.sendTransferLayer(state.currentSelectedLayerId)
    const layerListElement = refs.layersList?.querySelector(
      `div[data-id="${state.currentSelectedLayerId}"]`
    )
    layerListElement?.classList.add('editor-layers__layer-coworker')
    layerListElement?.classList.remove('editor-layers__layer-yours')
    layerListElement?.classList.remove('editor-layers__layer-selected')
    layersBridge.selectLayer(findFirstLayerForUser())
  }
}

export const renameLayerFromCoworker = (layerId: string, newName: string) => {
  const sanitized = String(newName || '').slice(0, MAX_LAYER_NAME_LENGTH)
  if (!sanitized) return
  layersBridge.addLayerHistoryRenameStep(layerId, sanitized, state.layers[layerId].name)
  layersBridge.saveLayerName(layerId, sanitized)
}

export const duplicateLayerFromCoworker = (layerId: string, newId: string) => {
  layersBridge.addLayerHistoryDuplicateStep(layerId, newId)
  layersBridge.duplicateLayer(layerId, newId)
}

export const mergeLayersFromCoworker = (
  layerOneId: string,
  layerTwoId: string,
  newLayerId: string
) => {
  layersBridge.addLayerHistoryMergeStep(layerOneId, layerTwoId, newLayerId)
  layersBridge.mergeLayers(layerOneId, layerTwoId, newLayerId, Coworking.getCoworkerUserId())
}

export const enableLayerFromCoworker = (layerId: string) => {
  layersBridge.enableLayer(layerId)
  layersBridge.addLayerHistoryEnableStep(layerId)
}

export const disableLayerFromCoworker = (layerId: string) => {
  layersBridge.disableLayer(layerId)
  layersBridge.addLayerHistoryDisableStep(layerId)
}

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
  layersBridge.addLayerHistoryContentChangedStep(layerId)
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
  layersBridge.addLayerHistoryContentChangedStep(layerId)
}

export const updateLayerOpacityFromCoworker = (
  layerId: string,
  opacity: number,
  oldValue: number
) => {
  layersBridge.addLayerHistoryOpacityStep(layerId, opacity, oldValue)
  opacity = round(opacity / 100, 2)
  state.layers[layerId].opacity = opacity
  state.layers[layerId].canvas.style.opacity = String(opacity)
}

export const layerDragChangeFromCoworker = (
  layerId: string,
  newOrder: number,
  oldOrder: number
) => {
  layersBridge.addLayerHistoryOrderStep(layerId, newOrder, oldOrder)
  layersBridge.updateLayerOrger(layerId, newOrder)
}

registerLayersBridge({
  selectCoworkerLayer,
})
