import { v4 as uuidv4 } from 'uuid'
import History from 'modules/History'
import * as Coworking from 'modules/Coworking'
import * as Messages from 'modules/Messages'
import { editorFacade } from 'pages/Editor/editorFacade'
import { preventDefault } from 'utils/domUtils'
import { removeOutElement, fadeOutElements, fadeInElements } from 'utils/animationsUtils'
import { mergeImages } from 'utils/imageUtils'
import { getNewContextForCanvas, fillCanvasWithImage } from 'utils/canvasUtils'
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
  layerCanUseLasso,
  LayerCanvasElement,
  LayerHistoryStep,
  LayerRecord,
  updateMagnetismCoords,
} from './layersState'
import { layersBridge, registerLayersBridge } from './layersBridge'
import {
  bakeMaskedLayerToSource,
  breakMaskLinksInvolvingLayer,
  canToggleMaskDown,
  compositeSourceToDisplay,
  findUpperLayerMaskedBy,
  getAdjacentMaskGroup,
  getLayerDirectlyBelow,
  getLayerDomCanvas,
  isLayerOccupiedByCoworker,
  refreshMaskDependents,
  syncLayerDisplay,
} from './layerMask'
import type { AdjustmentFilterKind, AdjustmentSpec } from './layerAdjustmentTypes'
import { defaultParamsForFilter } from './layerAdjustmentTypes'
import { renderAndCompositeAdjustment } from './layerAdjustmentRender'
import { closeAdjustPanel } from './layerAdjustPanelVisibility'
import { duplicateCanvas } from 'utils/imageUtils'
import { findAdjustmentForTarget, layerCanUseAdjust } from './layersState'

const claimLayerForLocalUser = (layerId: string) => {
  const layer = state.layers[layerId]
  if (!layer || layer.owner === Coworking.getUserId()) return
  layer.owner = Coworking.getUserId()
  layersBridge.syncLayerOwnerRow(layerId)
}

const selectLayer = async (layerId: string) => {
  if (!state.layers[layerId]) return
  if (isLayerOccupiedByCoworker(layerId)) return
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
      if (state.lassoMode) {
        layersBridge.endLassoMode()
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
    layersBridge.updateLayerListMaskAffordances()
  }
}

const _deleteLayer = async (
  layerId: string,
  nextSelectedId: string | 0 = 0,
  withAnimation = true,
  options?: { keepAdjustPanel?: boolean }
) => {
  const layer = state.layers[layerId]
  if (!layer) return
  const adjustmentOnTarget = findAdjustmentForTarget(layerId)
  if (adjustmentOnTarget) {
    await _deleteLayer(adjustmentOnTarget.id, 0, withAnimation, options)
  }
  if (layer.layerKind === 'adjustment' && layer.maskBelowLayerId) {
    const target = state.layers[layer.maskBelowLayerId]
    if (target) getLayerDomCanvas(target).style.visibility = ''
  }
  if (layer.layerKind === 'adjustment' && state.adjustPanelOpen && !options?.keepAdjustPanel) {
    closeAdjustPanel({ skipCommit: true })
  }
  if (layerId === state.currentSelectedLayerId && state.resizeMode) {
    layersBridge.updateResizeMode(false, false)
    editorFacade.hideDragBox()
  }
  if (layerId === state.currentSelectedLayerId && state.lassoMode) {
    layersBridge.endLassoMode()
  }
  refs.imageForResize = null
  if (refs.resizeBaseSnapshot) {
    refs.resizeBaseSnapshot.width = refs.resizeBaseSnapshot.height = 0
    refs.resizeBaseSnapshot = null
  }
  refs.resizeWarpSourcePixels = null
  if (refs.backgroundForResize) {
    refs.backgroundForResize.width = refs.backgroundForResize.height = 0
    refs.backgroundForResize = null
  }
  state.lassoTransformPoints = null
  state.lassoTransformOptions = null
  const selectAfter =
    nextSelectedId && nextSelectedId !== layerId
      ? nextSelectedId
      : layer.layerKind === 'adjustment'
        ? layer.maskBelowLayerId || 0
        : 0
  if (selectAfter && state.layers[selectAfter]) {
    await selectLayer(selectAfter)
  } else if (layerId === state.currentSelectedLayerId) {
    state.currentSelectedLayerId = false
  }
  if (!options?.keepAdjustPanel) layersBridge.closeParams()
  const listEl = refs.layersList?.querySelector(`div[data-id="${layerId}"]`) as HTMLElement | null
  breakMaskLinksInvolvingLayer(layerId)
  const domCanvas = getLayerDomCanvas(layer)
  if (withAnimation) {
    fadeOutElements(domCanvas)
    if (listEl) await removeOutElement(listEl)
  } else {
    domCanvas.classList.add('displayNone')
    listEl?.remove()
  }
  layer.previewRef = null
  domCanvas.remove()
  if (layer.displayCanvas && layer.displayCanvas !== layer.canvas) {
    layer.displayCanvas.width = layer.displayCanvas.height = 0
    layer.displayCanvas = null
  }
  layer.canvas.remove()
  state.deletedLayers[layerId] = layer
  delete state.layers[layerId]
  layersBridge.updateUndoRedoButtons()
  layersBridge.reorderLayersList()
  if (state.currentSelectedLayerId && state.layers[state.currentSelectedLayerId]) {
    layersBridge.updateParamsByLayer(state.currentSelectedLayerId)
  }
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
  newLayer.maskBelowLayerId = null
  newLayer.displayCanvas = null
  const maskGroup = getAdjacentMaskGroup(layerId)
  if (maskGroup) newLayer.order = maskGroup.upper.order + 1
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
  const selected = state.layers[state.currentSelectedLayerId]
  if (
    refs.duplicateLayerButton?.classList.contains('disabled') ||
    !Number.isFinite(selected.maxX) ||
    selected.layerKind === 'adjustment' ||
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
  syncLayerDisplay(layerTwo.id)
  syncLayerDisplay(layerOne.id)
  newLayerData.canvas = mergeImages([
    [getLayerDomCanvas(layerTwo), layerTwo.opacity],
    [getLayerDomCanvas(layerOne), layerOne.opacity, layerOne.blendMode],
  ]) as LayerCanvasElement
  newLayerData.blendMode = 'normal'
  newLayerData.canvas.context = getNewContextForCanvas(newLayerData.canvas)
  newLayerData.maskBelowLayerId = null
  newLayerData.displayCanvas = null
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
    fadeOutElements([
      getLayerDomCanvas(state.layers[layerOne.id]),
      getLayerDomCanvas(state.layers[layerTwo.id]),
    ]),
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

export const bakeAdjustmentIntoTarget = async (adjustmentLayerId: string) => {
  const adjustment = state.layers[adjustmentLayerId]
  const targetId = adjustment?.maskBelowLayerId
  const target = targetId ? state.layers[targetId] : undefined
  if (!adjustment?.adjustmentSpec || !target?.canvas) return

  await renderAndCompositeAdjustment(adjustmentLayerId, 'full')
  const snap = duplicateCanvas(target.canvas)
  fillCanvasWithImage(target.canvas.context, adjustment.canvas, 0, 0)
  target.canvas.context.globalCompositeOperation = 'destination-in'
  target.canvas.context.drawImage(snap, 0, 0)
  target.canvas.context.globalCompositeOperation = 'source-over'
  snap.width = snap.height = 0

  await layersBridge.updateLayerRealCoords(targetId!)
  await layersBridge.addLayerHistoryContentChangedStep(targetId!)
  layersBridge.updateLayerPreview(targetId!)
  syncLayerDisplay(targetId!)
}

export const createAdjustmentLayerForTarget = async (
  targetLayerId: string,
  filter: AdjustmentFilterKind = 'hsb'
) => {
  const target = state.layers[targetLayerId]
  if (!target || !layerCanUseAdjust(targetLayerId)) return null
  if (Object.keys(state.layers).length >= config.maxLayersNumber) return null

  await layersBridge.saveResizeModeIfNeeded()

  const newId = uuidv4()
  const insertOrder = getInsertOrderAboveLayer(targetLayerId)
  const newLayer = createNewLayerData()
  newLayer.id = newId
  newLayer.name = 'Adjust'
  newLayer.order = insertOrder
  newLayer.layerKind = 'adjustment'
  newLayer.maskBelowLayerId = targetLayerId
  newLayer.blendMode = 'normal'
  newLayer.minX = target.minX
  newLayer.minY = target.minY
  newLayer.maxX = target.maxX
  newLayer.maxY = target.maxY

  const selection = state.lassoSelection
  const adjustmentSpec: AdjustmentSpec = {
    version: 1,
    filter,
    params: defaultParamsForFilter(filter),
    pipeline: [],
    selection:
      selection && selection.points.length >= 3
        ? {
            points: selection.points.map((p) => [...p] as [number, number]),
            rings: selection.rings?.map((ring) => ring.map((p) => [...p] as [number, number])),
            inverted: selection.inverted,
          }
        : null,
  }
  newLayer.adjustmentSpec = adjustmentSpec
  newLayer.canvas = createNewLayerCanvas()

  Object.keys(state.layers).forEach((id) => {
    if (state.layers[id].order >= insertOrder) state.layers[id].order++
  })
  state.layers[newId] = newLayer
  await layersBridge.createNewLayerDom(newId, true)
  layersBridge.reorderLayersList()
  await selectLayer(newId)
  await renderAndCompositeAdjustment(newId, 'full')
  layersBridge.updateLayerPreview(newId)
  return newId
}

export const mergeDownSelectedLayer = async (e?: Event) => {
  if (e) preventDefault(e)
  if (layersBridge.paramsAreClosed() || !state.currentSelectedLayerId) {
    return
  }
  layersBridge.openParams()

  const selectedLayer = state.layers[state.currentSelectedLayerId]
  const empty = !Number.isFinite(selectedLayer.minX)

  if (
    selectedLayer.layerKind === 'adjustment' &&
    selectedLayer.maskBelowLayerId &&
    state.layers[selectedLayer.maskBelowLayerId]
  ) {
    if (refs.mergeDownLayerButton?.classList.contains('disabled')) return
    layersBridge.closeParams()
    closeAdjustPanel()
    const targetId = selectedLayer.maskBelowLayerId
    await bakeAdjustmentIntoTarget(selectedLayer.id)
    await layersBridge._deleteLayer(selectedLayer.id, targetId)
    await selectLayer(targetId)
    if (Coworking.isOpen()) {
      Coworking.sendAdjustmentLayerBake(selectedLayer.id, targetId)
    }
    layersBridge.updateUndoRedoButtons()
    layersBridge.openParams()
    return
  }

  const canMergeDown =
    !empty &&
    !selectedLayer.maskBelowLayerId &&
    !findUpperLayerMaskedBy(selectedLayer.id) &&
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

  fadeInElements(getLayerDomCanvas(layer), { maxFadeIn: layer.opacity })
  if (layerId === state.currentSelectedLayerId) {
    const canBeResized = layerCanBeResized(layerId)
    const canUseLasso = layerCanUseLasso(layerId)
    layersBridge.updateEditorCanvas()
    layersBridge.updateResizeMode(false, canBeResized)
    layersBridge.updateLassoMode(false, canUseLasso)
    layersBridge.updateGcoMode(false, canBeResized)
    const visibilityIcon = refs.visibilityLayerButton?.querySelector('.editor-layers__params-icon')
    visibilityIcon?.classList.toggle('svg-icon-visible', layer.active)
    visibilityIcon?.classList.toggle('svg-icon-hidden', !layer.active)
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

  fadeOutElements(getLayerDomCanvas(layer), { maxFadeIn: layer.opacity })
  if (layerId === state.currentSelectedLayerId) {
    layersBridge.updateEditorCanvas()
    layersBridge.updateResizeMode(false, false)
    layersBridge.updateLassoMode(false, false)
    layersBridge.updateGcoMode(state.gcoMode, false)
    const visibilityIcon = refs.visibilityLayerButton?.querySelector('.editor-layers__params-icon')
    visibilityIcon?.classList.toggle('svg-icon-visible', layer.active)
    visibilityIcon?.classList.toggle('svg-icon-hidden', !layer.active)
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
    (layerId === state.currentSelectedLayerId && (state.resizeMode || state.lassoMode))
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
  syncLayerDisplay(layerId)
  refreshMaskDependents(layerId)
  layer.minX = Infinity
  layer.minY = Infinity
  layer.maxY = -Infinity
  layer.maxX = -Infinity
}

const applyLayerMaskLink = async (
  layerId: string,
  maskBelowLayerId: string | null,
  recordHistory = true,
  bakeOnUnmask = true
) => {
  const layer = state.layers[layerId]
  if (!layer) return
  const oldMaskBelowLayerId = layer.maskBelowLayerId
  if (oldMaskBelowLayerId === maskBelowLayerId) return

  const shouldBakeUnmask = Boolean(bakeOnUnmask && oldMaskBelowLayerId && !maskBelowLayerId)
  if (shouldBakeUnmask) {
    bakeMaskedLayerToSource(layerId)
  }

  layer.maskBelowLayerId = maskBelowLayerId
  if (shouldBakeUnmask) {
    await layersBridge.commitLayerCanvasStepOnly(layerId)
  } else if (maskBelowLayerId) {
    compositeSourceToDisplay(layerId)
  } else {
    syncLayerDisplay(layerId)
  }
  layersBridge.updateLayerPreview(layerId)
  layersBridge.updateLayerListMaskAffordances()
  layersBridge.updateParamsByLayer(layerId)
  layersBridge.updateEditorCanvas()

  if (recordHistory) {
    await layersBridge.addLayerHistoryMaskStep(layerId, maskBelowLayerId, oldMaskBelowLayerId)
    if (Coworking.isOpen()) {
      Coworking.sendLayerMask(layerId, maskBelowLayerId, oldMaskBelowLayerId)
    }
    layersBridge.updateUndoRedoButtons()
  }
}

const setLayerMaskDown = async (enabled: boolean) => {
  if (!state.currentSelectedLayerId) return
  const layerId = state.currentSelectedLayerId
  const layer = state.layers[layerId]
  if (!layer) return

  if (enabled) {
    const lower = getLayerDirectlyBelow(layerId)
    if (!lower || !canToggleMaskDown(layerId)) return
    claimLayerForLocalUser(layerId)
    claimLayerForLocalUser(lower.id)
    await applyLayerMaskLink(layerId, lower.id)
  } else {
    await applyLayerMaskLink(layerId, null)
  }
}

export const toggleMaskDownSelectedLayer = async (e?: Event) => {
  if (e) preventDefault(e)
  if (layersBridge.paramsAreClosed() || !state.currentSelectedLayerId) {
    return
  }
  layersBridge.openParams()

  const layer = state.layers[state.currentSelectedLayerId]
  const isMasked = Boolean(layer?.maskBelowLayerId)
  const canEnable = canToggleMaskDown(state.currentSelectedLayerId)

  if (!canEnable) {
    return
  }
  if (state.resizeMode || state.lassoMode) {
    return
  }

  await layersBridge.saveResizeModeIfNeeded()
  layersBridge.closeParams()
  await setLayerMaskDown(!isMasked)
  layersBridge.openParams()
}

export const clearCurrentLayer = async (): Promise<boolean> => {
  if (state.lassoMode) {
    layersBridge.endLassoMode()
  }
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
  if (state.lassoMode) {
    layersBridge.endLassoMode()
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
    layersBridge.reorderLayersList()
    layersIds.forEach((id) => {
      syncLayerDisplay(id)
      layersBridge.updateLayerPreview(id)
    })
    await selectLayer(layersIds.find((layerId) => state.layers[layerId].selected) || layersIds[0])
    layersBridge.updateLayerListMaskAffordances()
  } else {
    await addNewLayer()
  }
}

const getInsertOrderAboveLayer = (layerId: string): number => {
  const sourceLayer = state.layers[layerId]
  if (!sourceLayer) return 0
  const upperMasked = findUpperLayerMaskedBy(layerId)
  return (upperMasked ? upperMasked.order : sourceLayer.order) + 1
}

const createLayerFromSelectionCanvas = async (
  newLayerId: string,
  insertOrder: number,
  selectedCanvas: HTMLCanvasElement | OffscreenCanvas,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  ownerId = Coworking.getUserId(),
  layerName?: string
): Promise<LayerRecord> => {
  const newLayer = createNewLayerData(ownerId)
  newLayer.id = newLayerId
  if (layerName) {
    newLayer.name = layerName.slice(0, MAX_LAYER_NAME_LENGTH)
  }
  newLayer.order = insertOrder
  newLayer.minX = minX
  newLayer.minY = minY
  newLayer.maxX = maxX
  newLayer.maxY = maxY
  newLayer.modified = true
  newLayer.canvas = createNewLayerCanvas()
  newLayer.canvas.context.drawImage(selectedCanvas, minX, minY)

  Object.keys(state.layers).forEach((id) => {
    if (state.layers[id].order >= insertOrder) {
      state.layers[id].order++
    }
  })

  state.layers[newLayerId] = newLayer
  await layersBridge.createNewLayerDom(newLayerId, true)
  layersBridge.reorderLayersList()
  return newLayer
}

export const clearLassoSelection = async () => {
  if (!state.currentSelectedLayerId || !state.lassoSelection || !state.lassoSelection.hasPixels) {
    return
  }
  const layerId = state.currentSelectedLayerId
  const layer = state.layers[layerId]
  if (!layer) return
  const { outsideCanvas, points, rings, inverted } = state.lassoSelection
  const basePoints = state.lassoFloatBasePoints || points
  const baseRings = state.lassoFloatBaseRings || rings
  state.lassoFloatDirty = false
  fillCanvasWithImage(layer.canvas.context, outsideCanvas, 0, 0)
  layersBridge.endLassoMode(false)
  await layersBridge.addLayerHistoryContentChangedStep(layerId)
  layersBridge.updateUndoRedoButtons()
  if (Coworking.isOpen()) {
    Coworking.sendLassoClearLayer(layerId, basePoints, inverted, baseRings)
  }
}

export const copyLassoSelectionToNewLayer = async () => {
  if (
    !state.currentSelectedLayerId ||
    !state.lassoSelection ||
    !state.lassoSelection.hasPixels ||
    Object.keys(state.layers).length >= config.maxLayersNumber
  ) {
    return
  }
  const sourceLayerId = state.currentSelectedLayerId
  const { selectedCanvas, minX, minY, maxX, maxY, points, rings, inverted } = state.lassoSelection
  const insertOrder = getInsertOrderAboveLayer(sourceLayerId)
  const newLayerId = uuidv4()

  const newLayer = await createLayerFromSelectionCanvas(
    newLayerId,
    insertOrder,
    selectedCanvas,
    minX,
    minY,
    maxX,
    maxY
  )
  layersBridge.endLassoMode()
  await layersBridge.addLayerHistoryNewStep(newLayerId)
  await selectLayer(newLayerId)
  layersBridge.updateUndoRedoButtons()
  if (Coworking.isOpen()) {
    Coworking.sendLassoCopyToLayer(
      sourceLayerId,
      newLayerId,
      insertOrder,
      newLayer.name,
      points,
      inverted,
      rings
    )
  }
  layersBridge.startResizeMode()
}

export const cutLassoSelectionToNewLayer = async () => {
  if (
    !state.currentSelectedLayerId ||
    !state.lassoSelection ||
    !state.lassoSelection.hasPixels ||
    Object.keys(state.layers).length >= config.maxLayersNumber
  ) {
    return
  }
  const sourceLayerId = state.currentSelectedLayerId
  const sourceLayer = state.layers[sourceLayerId]
  if (!sourceLayer) return

  const { selectedCanvas, outsideCanvas, minX, minY, maxX, maxY, points, rings, inverted } =
    state.lassoSelection
  const basePoints = state.lassoFloatBasePoints || points
  const baseRings = state.lassoFloatBaseRings || rings
  const insertOrder = getInsertOrderAboveLayer(sourceLayerId)
  const newLayerId = uuidv4()

  state.lassoFloatDirty = false
  fillCanvasWithImage(sourceLayer.canvas.context, outsideCanvas, 0, 0)
  await layersBridge.commitLayerCanvasStepOnly(sourceLayerId)

  const newLayer = await createLayerFromSelectionCanvas(
    newLayerId,
    insertOrder,
    selectedCanvas,
    minX,
    minY,
    maxX,
    maxY
  )
  layersBridge.endLassoMode(false)
  await layersBridge.addLayerHistoryCutToNewStep(sourceLayerId, newLayerId)
  await selectLayer(newLayerId)
  layersBridge.updateUndoRedoButtons()
  if (Coworking.isOpen()) {
    Coworking.sendLassoCutToLayer(
      sourceLayerId,
      newLayerId,
      insertOrder,
      newLayer.name,
      basePoints,
      inverted,
      baseRings
    )
  }
  layersBridge.startResizeMode()
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
  applyLayerMaskLink,
  createLayerFromSelectionCanvas,
})
