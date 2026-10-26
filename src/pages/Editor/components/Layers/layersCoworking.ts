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
import { getLayerDomCanvas, syncLayerDisplay } from './layerMask'
import { clearPolygonFromCanvas, extractLassoSelection, LassoPoint } from './layerLasso'

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
  layer.maskBelowLayerId = layer.maskBelowLayerId ?? null
  layer.displayCanvas = null
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

export const receiveLayerMaskFromCoworker = async (
  layerId: string,
  maskBelowLayerId: string | null,
  oldMaskBelowLayerId: string | null
) => {
  await layersBridge.applyLayerMaskLink(layerId, maskBelowLayerId, false)
  layersBridge.addLayerHistoryMaskStep(layerId, maskBelowLayerId, oldMaskBelowLayerId)
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

export const receiveLassoClearFromCoworker = async (
  layerId: string,
  points: LassoPoint[],
  inverted?: boolean,
  rings?: LassoPoint[][]
) => {
  const layer = state.layers[layerId]
  if (!layer) return
  clearPolygonFromCanvas(layer.canvas.context, points, { inverted, rings })
  await layersBridge.addLayerHistoryContentChangedStep(layerId)
}

export const receiveLassoTransformFromCoworker = async (
  layerId: string,
  points: LassoPoint[],
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  inverted?: boolean,
  rings?: LassoPoint[][]
) => {
  const layer = state.layers[layerId]
  if (!layer) return
  syncLayerDisplay(layer.id)
  const result = await extractLassoSelection(layer.canvas, points, getLayerDomCanvas(layer), {
    inverted,
    rings,
  })
  if (!result || !result.hasPixels) return
  const minX = round(x - w / 2, 1)
  const minY = round(y - h / 2, 1)
  const rotation = convertAngleDegToRad(r)
  fillCanvasWithImage(layer.canvas.context, result.outsideCanvas, 0, 0)
  fillCanvasWithImage(
    layer.canvas.context,
    result.selectedCanvas,
    minX,
    minY,
    w,
    h,
    rotation,
    false
  )
  result.selectedCanvas.width = result.selectedCanvas.height = 0
  result.outsideCanvas.width = result.outsideCanvas.height = 0
  result.maskCanvas.width = result.maskCanvas.height = 0
  await layersBridge.addLayerHistoryContentChangedStep(layerId)
}

export const receiveLassoCopyToLayerFromCoworker = async (
  sourceLayerId: string,
  newLayerId: string,
  insertOrder: number,
  layerName: string,
  points: LassoPoint[],
  inverted?: boolean,
  rings?: LassoPoint[][]
) => {
  const sourceLayer = state.layers[sourceLayerId]
  if (!sourceLayer) return
  syncLayerDisplay(sourceLayer.id)
  const result = await extractLassoSelection(
    sourceLayer.canvas,
    points,
    getLayerDomCanvas(sourceLayer),
    { inverted, rings }
  )
  if (!result || !result.hasPixels) return
  await layersBridge.createLayerFromSelectionCanvas(
    newLayerId,
    insertOrder,
    result.selectedCanvas,
    result.minX,
    result.minY,
    result.maxX,
    result.maxY,
    Coworking.getCoworkerUserId(),
    layerName
  )
  result.selectedCanvas.width = result.selectedCanvas.height = 0
  result.outsideCanvas.width = result.outsideCanvas.height = 0
  result.maskCanvas.width = result.maskCanvas.height = 0
  await layersBridge.addLayerHistoryNewStep(newLayerId)
  selectCoworkerLayer(newLayerId)
}

export const receiveLassoCutToLayerFromCoworker = async (
  sourceLayerId: string,
  newLayerId: string,
  insertOrder: number,
  layerName: string,
  points: LassoPoint[],
  inverted?: boolean,
  rings?: LassoPoint[][]
) => {
  const sourceLayer = state.layers[sourceLayerId]
  if (!sourceLayer) return
  syncLayerDisplay(sourceLayer.id)
  const result = await extractLassoSelection(
    sourceLayer.canvas,
    points,
    getLayerDomCanvas(sourceLayer),
    { inverted, rings }
  )
  if (!result || !result.hasPixels) return
  fillCanvasWithImage(sourceLayer.canvas.context, result.outsideCanvas, 0, 0)
  await layersBridge.commitLayerCanvasStepOnly(sourceLayerId)
  await layersBridge.createLayerFromSelectionCanvas(
    newLayerId,
    insertOrder,
    result.selectedCanvas,
    result.minX,
    result.minY,
    result.maxX,
    result.maxY,
    Coworking.getCoworkerUserId(),
    layerName
  )
  result.selectedCanvas.width = result.selectedCanvas.height = 0
  result.outsideCanvas.width = result.outsideCanvas.height = 0
  result.maskCanvas.width = result.maskCanvas.height = 0
  await layersBridge.addLayerHistoryCutToNewStep(sourceLayerId, newLayerId)
  selectCoworkerLayer(newLayerId)
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
  getLayerDomCanvas(state.layers[layerId]).style.opacity = String(opacity)
}

export const layerDragChangeFromCoworker = (
  layerId: string,
  newOrder: number,
  oldOrder: number,
  partnerLayerId?: string
) => {
  layersBridge.addLayerHistoryOrderStep(layerId, newOrder, oldOrder, partnerLayerId)
  if (partnerLayerId) {
    layersBridge.placeMaskGroupAtUpperOrder(layerId, partnerLayerId, newOrder)
  } else {
    layersBridge.updateLayerOrger(layerId, newOrder)
  }
}

registerLayersBridge({
  selectCoworkerLayer,
})
