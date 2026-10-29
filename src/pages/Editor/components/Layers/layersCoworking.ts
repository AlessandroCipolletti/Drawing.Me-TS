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
  createNewLayerData,
  filterYoursLayers,
  findFirstLayerForUser,
  isYourLayerYours,
  LayerHistoryStep,
  LayerRecord,
} from './layersState'
import { normalizeBlendMode } from './layerBlendMode'
import { layersBridge, registerLayersBridge } from './layersBridge'
import {
  findSelectableLayerForUser,
  getLayerDomCanvas,
  isLayerInMaskPair,
  isLayerOccupiedByCoworker,
  syncLayerDisplay,
} from './layerMask'
import { clearPolygonFromCanvas, extractLassoSelection, LassoPoint } from './layerLasso'
import type { AdjustmentSpec } from './layerAdjustmentTypes'

import { renderAndCompositeAdjustment } from './layerAdjustmentRender'
import { bakeAdjustmentIntoTarget } from './layersActions'
import { cloneTextSpec, type TextSpec } from 'pages/Editor/text/textSpec'
import { ensureTextFontLoaded } from 'pages/Editor/text/textFonts'
import { paintTextSpecOnContext } from 'pages/Editor/text/textRaster'

const releaseCurrentLayerIfBlocked = () => {
  const current = state.currentSelectedLayerId
  if (!current) return
  if (isYourLayerYours(current) && !isLayerOccupiedByCoworker(current)) return
  state.currentSelectedLayerId = false
  filterYoursLayers().forEach((layer) => {
    layer.selected = false
    refs.layersList
      ?.querySelector(`div[data-id="${layer.id}"]`)
      ?.classList.remove('editor-layers__layer-selected')
  })
  const next = findSelectableLayerForUser()
  if (next) void layersBridge.selectLayer(next)
}

const giveLayerToCoworker = (layerId: string) => {
  const layer = state.layers[layerId]
  const coworkerId = Coworking.getCoworkerUserId()
  if (!layer || !coworkerId || layer.owner === coworkerId) return
  layer.owner = coworkerId
  layer.selected = false
  layersBridge.syncLayerOwnerRow(layerId)
}

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
  layersBridge.updateLayerListMaskAffordances()
  releaseCurrentLayerIfBlocked()
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
  layer.blendMode = normalizeBlendMode(layer.blendMode)
  layer.maskBelowLayerId = layer.maskBelowLayerId ?? null
  layer.layerKind = layer.layerKind ?? 'pixel'
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
    !isLayerInMaskPair(state.currentSelectedLayerId) &&
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
  if (maskBelowLayerId) {
    giveLayerToCoworker(layerId)
    giveLayerToCoworker(maskBelowLayerId)
  }
  await layersBridge.applyLayerMaskLink(layerId, maskBelowLayerId, false)
  layersBridge.addLayerHistoryMaskStep(layerId, maskBelowLayerId, oldMaskBelowLayerId)
  layersBridge.updateLayerListMaskAffordances()
  releaseCurrentLayerIfBlocked()
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

export const updateLayerBlendModeFromCoworker = (
  layerId: string,
  blendModeNew: string,
  blendModeOld: string
) => {
  layersBridge.addLayerHistoryBlendModeStep(
    layerId,
    normalizeBlendMode(blendModeNew),
    normalizeBlendMode(blendModeOld)
  )
  layersBridge._updateLayerBlendMode(layerId, normalizeBlendMode(blendModeNew))
  if (state.currentSelectedLayerId === layerId) {
    layersBridge.updateParamsByLayer(layerId)
  }
}

export const layerDragChangeFromCoworker = (
  layerId: string,
  newOrder: number,
  _oldOrder: number,
  partnerLayerId?: string
) => {
  const layer = state.layers[layerId]
  if (!layer) return
  if (partnerLayerId) {
    const upperOrder = layersBridge.snapGroupUpperOrder(layerId, partnerLayerId, newOrder)
    if (layer.order === upperOrder) return
    layersBridge.addLayerHistoryOrderStep(layerId, upperOrder, layer.order, partnerLayerId)
    layersBridge.placeMaskGroupAtUpperOrder(layerId, partnerLayerId, upperOrder)
    return
  }
  const targetOrder = layersBridge.snapTargetOrder(layerId, newOrder)
  if (layer.order === targetOrder) return
  layersBridge.addLayerHistoryOrderStep(layerId, targetOrder, layer.order)
  layersBridge.updateLayerOrger(layerId, targetOrder)
}

export const receiveAdjustmentLayerCreateFromCoworker = async (
  layerId: string,
  targetLayerId: string,
  insertOrder: number,
  adjustmentSpec: AdjustmentSpec
) => {
  const target = state.layers[targetLayerId]
  if (!target) return
  const newLayer = createNewLayerData(Coworking.getCoworkerUserId())
  newLayer.id = layerId
  newLayer.name = 'Adjust'
  newLayer.order = insertOrder
  newLayer.layerKind = 'adjustment'
  newLayer.maskBelowLayerId = targetLayerId
  newLayer.adjustmentSpec = adjustmentSpec
  newLayer.canvas = createNewLayerCanvas()
  newLayer.minX = target.minX
  newLayer.minY = target.minY
  newLayer.maxX = target.maxX
  newLayer.maxY = target.maxY
  Object.keys(state.layers).forEach((id) => {
    if (state.layers[id].order >= insertOrder) state.layers[id].order++
  })
  state.layers[layerId] = newLayer
  await layersBridge.createNewLayerDom(layerId, true)
  layersBridge.reorderLayersList()
  await renderAndCompositeAdjustment(layerId, 'full')
  layersBridge.addLayerHistoryNewStep(layerId)
}

export const receiveAdjustmentLayerUpdateFromCoworker = async (
  layerId: string,
  adjustmentSpec: AdjustmentSpec
) => {
  const layer = state.layers[layerId]
  if (!layer) return
  layer.adjustmentSpec = adjustmentSpec
  await renderAndCompositeAdjustment(layerId, 'full')
  layersBridge.updateLayerPreview(layerId)
}

export const receiveTextLayerUpdateFromCoworker = async (
  layerId: string,
  textSpec: TextSpec | null,
  name?: string
) => {
  const layer = state.layers[layerId]
  if (!layer?.canvas?.context) return
  const cloned = cloneTextSpec(textSpec)
  layer.textSpec = cloned
  if (cloned) {
    await ensureTextFontLoaded(cloned.fontFamily)
    paintTextSpecOnContext(layer.canvas.context, cloned, { clearTarget: true })
  }
  if (name) {
    layersBridge.saveLayerName(layerId, name)
  }
  await layersBridge.addLayerHistoryContentChangedStep(layerId)
}

export const receiveAdjustmentLayerBakeFromCoworker = async (
  adjustmentLayerId: string,
  targetLayerId: string
) => {
  if (!state.layers[adjustmentLayerId]) return
  await bakeAdjustmentIntoTarget(adjustmentLayerId)
  await layersBridge._deleteLayer(adjustmentLayerId, targetLayerId)
}

registerLayersBridge({
  selectCoworkerLayer,
})
