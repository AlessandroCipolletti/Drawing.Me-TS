import * as Coworking from 'modules/Coworking'
import { editorFacade } from 'pages/Editor/editorFacade'
import { preventDefault } from 'utils/domUtils'
import { round, convertAngleDegToRad } from 'utils/mathUtils'
import { cropImageWithMargin, flipImage } from 'utils/imageUtils'
import { fillCanvasWithImage } from 'utils/canvasUtils'
import { handleElementsListDragAndDrop } from 'utils/uiUtils'
import { delay } from 'utils/jsUtils'
import { timing } from 'main/Theme'
import {
  config,
  state,
  refs,
  isYourLayerYours,
  layerCanBeResized,
  updateMagnetismCoords,
} from './layersState'
import { layersBridge, registerLayersBridge } from './layersBridge'
import { editorCalls } from 'pages/Editor/editorCalls'
import {
  canToggleMaskDown,
  getLayerDomCanvas,
  refreshMaskDependents,
  syncLayerDisplay,
} from './layerMask'
import { extractLassoSelection, LassoPoint } from './layerLasso'

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

const updateLayerListMaskAffordances = () => {
  if (!refs.layersList) return
  refs.layersList.querySelectorAll('.editor-layers__layer').forEach((row) => {
    row.classList.remove('editor-layers__layer--mask-upper', 'editor-layers__layer--mask-lower')
    const label = row.querySelector('.editor-layers__layer-mask-label')
    if (label) {
      label.classList.add('displayNone')
      label.textContent = 'Mask'
    }
  })
  Object.values(state.layers).forEach((layer) => {
    if (!layer.maskBelowLayerId) return
    const upperRow = refs.layersList?.querySelector(`div[data-id="${layer.id}"]`)
    const lowerRow = refs.layersList?.querySelector(`div[data-id="${layer.maskBelowLayerId}"]`)
    upperRow?.classList.add('editor-layers__layer--mask-upper')
    lowerRow?.classList.add('editor-layers__layer--mask-lower')
    const upperLabel = upperRow?.querySelector('.editor-layers__layer-mask-label')
    if (upperLabel) {
      upperLabel.textContent = 'Clip'
      upperLabel.classList.remove('displayNone')
    }
    const lowerLabel = lowerRow?.querySelector('.editor-layers__layer-mask-label')
    if (lowerLabel) {
      lowerLabel.textContent = 'Mask'
      lowerLabel.classList.remove('displayNone')
    }
  })
}

const updateEditorCanvas = () => {
  if (state.currentSelectedLayerId && state.layers[state.currentSelectedLayerId]) {
    const domCanvas = getLayerDomCanvas(state.layers[state.currentSelectedLayerId])
    editorFacade.updateEditorLayer(
      parseInt(domCanvas.style.zIndex, 10),
      state.layers[state.currentSelectedLayerId].opacity,
      state.gcoMode ? 'source-atop' : 'source-over',
      state.layers[state.currentSelectedLayerId].active
    )
  }
}

const updateCanvasPanMode = (selected: boolean) => {
  if (selected !== state.canvasPanMode) {
    state.canvasPanMode = selected
    refs.canvasPanButton?.classList.toggle('selected', selected)
    editorFacade.setDesktopCanvasPanMode(selected)
  }
}

const updateResizeMode = (selected: boolean, active: boolean) => {
  refs.resizeButton?.classList.toggle('disabled', !active)
  if (selected !== state.resizeMode) {
    state.resizeMode = selected
    refs.resizeButton?.classList.toggle('selected', selected)
  }
}

export const discardPendingLassoSelection = () => {
  if (state.lassoSelection) {
    state.lassoSelection.selectedCanvas.width = state.lassoSelection.selectedCanvas.height = 0
    state.lassoSelection.outsideCanvas.width = state.lassoSelection.outsideCanvas.height = 0
    state.lassoSelection = null
  }
}

export const canCreateLayerFromLasso = (): boolean =>
  Object.keys(state.layers).length < config.maxLayersNumber

const updateLassoMode = (selected: boolean, active: boolean) => {
  refs.lassoButton?.classList.toggle('disabled', !active)
  if (selected !== state.lassoMode) {
    state.lassoMode = selected
    refs.lassoButton?.classList.toggle('selected', selected)
    editorFacade.setLassoModeActive(selected)
    if (!selected) {
      discardPendingLassoSelection()
    }
  }
}

const updateGcoMode = (selected: boolean, active: boolean) => {
  refs.gcoButton?.classList.toggle('disabled', !active || state.editorIsUsingEraser)
  if (selected !== state.gcoMode) {
    state.gcoMode = selected
    refs.gcoButton?.classList.remove(
      'svg-icon-source-atop',
      'svg-icon-source-over',
      'svg-icon-source-over-atop',
      'png-icon-source-atop',
      'png-icon-source-over',
      'png-icon-source-over-atop'
    )
    refs.gcoButton?.classList.toggle('selected', selected)
    if (selected) {
      refs.gcoButton?.classList.add('svg-icon-source-atop')
    } else {
      refs.gcoButton?.classList.add('svg-icon-source-over')
    }
    updateEditorCanvas()
  }
}

const updateParamsByLayer = (layerId: string | false = state.currentSelectedLayerId) => {
  if (layerId && isYourLayerYours(layerId)) {
    const layer = state.layers[layerId]
    const yourLayers = Object.values(state.layers).filter((l) => isYourLayerYours(l.id))
    const empty = !Number.isFinite(layer.minX)
    const canBeResized = layerCanBeResized(layerId)
    const canBeDeleted = yourLayers.length > 1
    const opacity = round(layer.opacity * 100, 0)
    const canMergeDown =
      !empty &&
      !layer.maskBelowLayerId &&
      yourLayers.length > 1 &&
      layer.order > 0 &&
      Object.values(state.layers).find((l) => l.order === layer.order - 1)?.owner ===
        Coworking.getUserId()
    const canMaskDown = canToggleMaskDown(layerId)
    const maskActive = Boolean(layer.maskBelowLayerId)
    const canDuplicate = !empty && Object.values(state.layers).length < config.maxLayersNumber
    const canTransferLayer = Coworking.isOpen() && yourLayers.length > 1 && layer.active

    if (refs.opacityLabel) refs.opacityLabel.innerHTML = `${round(opacity, 0)}`
    if (refs.opacityCursor) refs.opacityCursor.style.bottom = `${opacity}%`
    if (refs.opacitySlider) {
      refs.opacitySlider.style.backgroundImage = `linear-gradient(0deg, var(--palette-gray-1) ${opacity}%, var(--palette-gray-6) ${opacity}%)`
    }
    refs.duplicateLayerButton?.classList.toggle('disabled', !canDuplicate)
    refs.deleteLayerButton?.classList.toggle('disabled', !canBeDeleted)
    refs.mergeDownLayerButton?.classList.toggle('disabled', !canMergeDown)
    refs.maskDownLayerButton?.classList.toggle(
      'disabled',
      state.resizeMode || state.lassoMode || (!canMaskDown && !maskActive)
    )
    refs.maskDownLayerButton?.classList.toggle('selected', maskActive)
    refs.flipVerticalButton?.classList.toggle('disabled', empty)
    refs.flipHorizontalButton?.classList.toggle('disabled', empty)
    refs.sendLayerButton?.classList.toggle('disabled', !canTransferLayer)
    const wasInResizeMode = state.resizeMode
    const wasInLassoMode = state.lassoMode
    updateResizeMode(state.resizeMode && canBeResized, canBeResized)
    updateLassoMode(state.lassoMode && canBeResized, canBeResized)
    updateGcoMode(
      state.gcoMode && canBeResized,
      !state.resizeMode && !state.lassoMode && canBeResized
    )
    if (wasInResizeMode && !state.resizeMode) {
      editorFacade.hideDragBox()
    }
    if (wasInLassoMode && !state.lassoMode) {
      editorFacade.setLassoModeActive(false)
    }
    const visibilityIcon = refs.visibilityLayerButton?.querySelector('.editor-layers__params-icon')
    visibilityIcon?.classList.toggle('svg-icon-visible', layer.active)
    visibilityIcon?.classList.toggle('svg-icon-hidden', !layer.active)
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
    const ctx = state.layers[state.currentSelectedLayerId].canvas.context
    if (refs.backgroundForResize) {
      fillCanvasWithImage(ctx, refs.backgroundForResize, 0, 0)
      fillCanvasWithImage(ctx, refs.imageForResize, minX, minY, w, h, rotation, false)
    } else {
      fillCanvasWithImage(ctx, refs.imageForResize, minX, minY, w, h, rotation)
    }
    syncLayerDisplay(state.currentSelectedLayerId)
    refreshMaskDependents(state.currentSelectedLayerId)
  }
  if (madeChanges) {
    editorCalls.toggleButton('undo', true)
    state.resizeModeMadeChanges = true
  }
}

const endLassoMode = () => {
  discardPendingLassoSelection()
  editorFacade.setLassoModeActive(false)
  if (state.currentSelectedLayerId && state.layers[state.currentSelectedLayerId]) {
    const canBeResized = layerCanBeResized(state.currentSelectedLayerId)
    const layerOptionButton = refs.layersList?.querySelector(
      `div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`
    )
    if (!state.resizeMode) {
      layerOptionButton?.classList.remove('disabled')
      refs.visibilityLayerButton?.classList.remove('disabled')
      editorCalls.toggleButton('clear', true)
    }
    updateLassoMode(false, canBeResized)
    updateGcoMode(state.gcoMode, !state.resizeMode && canBeResized)
    updateParamsByLayer(state.currentSelectedLayerId)
  } else {
    updateLassoMode(false, false)
  }
}

const startLassoMode = async () => {
  if (!state.currentSelectedLayerId) return
  if (state.canvasPanMode) {
    updateCanvasPanMode(false)
  }
  if (state.resizeMode) {
    await endResizeMode()
  }
  const layerOptionButton = refs.layersList?.querySelector(
    `div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`
  )
  layerOptionButton?.classList.add('disabled')
  refs.visibilityLayerButton?.classList.add('disabled')
  refs.maskDownLayerButton?.classList.add('disabled')
  editorCalls.hideRuler()
  editorCalls.deselectPipette(true, false, true)
  updateLassoMode(true, true)
  updateGcoMode(state.gcoMode, false)
}

export const completeLassoSelection = async (
  points: LassoPoint[]
): Promise<{ minX: number; minY: number; maxX: number; maxY: number } | null> => {
  if (!state.currentSelectedLayerId || !state.lassoMode) return null
  const layer = state.layers[state.currentSelectedLayerId]
  if (!layer || !Number.isFinite(layer.minX)) return null
  const result = await extractLassoSelection(layer.canvas, points)
  if (!result || !state.lassoMode) {
    if (result) {
      result.selectedCanvas.width = result.selectedCanvas.height = 0
      result.outsideCanvas.width = result.outsideCanvas.height = 0
    }
    return null
  }
  discardPendingLassoSelection()
  state.lassoSelection = result
  return {
    minX: result.minX,
    minY: result.minY,
    maxX: result.maxX,
    maxY: result.maxY,
  }
}

export const cancelLassoSelection = () => {
  if (state.lassoSelection) {
    discardPendingLassoSelection()
    editorFacade.clearLassoSelectionOverlay()
  } else if (state.lassoMode) {
    endLassoMode()
  }
}

export const startTransformLassoSelectionInPlace = () => {
  if (!state.currentSelectedLayerId || !state.lassoSelection) return
  const selection = state.lassoSelection
  state.lassoSelection = null
  endLassoMode()
  if (state.canvasPanMode) {
    updateCanvasPanMode(false)
  }
  const layerOptionButton = refs.layersList?.querySelector(
    `div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`
  )
  layerOptionButton?.classList.add('disabled')
  updateResizeMode(true, true)
  updateLassoMode(false, true)
  updateGcoMode(state.gcoMode, false)
  state.resizeModeMadeChanges = false
  editorCalls.toggleButton('undo', false)
  editorCalls.toggleButton('redo', false)
  editorCalls.toggleButton('clear', false)
  refs.resizeButton?.classList.toggle('selected', state.resizeMode)
  refs.visibilityLayerButton?.classList.add('disabled')
  refs.maskDownLayerButton?.classList.add('disabled')
  editorCalls.deselectPipette(true, false, true)
  refs.imageForResize = selection.selectedCanvas
  refs.backgroundForResize = selection.outsideCanvas
  state.lassoTransformPoints = selection.points
  updateMagnetismCoords(state.currentSelectedLayerId)
  editorFacade.showDragBox(
    round(selection.minX + selection.width / 2, 1),
    round(selection.minY + selection.height / 2, 1),
    selection.width,
    selection.height,
    true
  )
}

const startResizeMode = () => {
  if (!state.currentSelectedLayerId) return
  if (state.lassoMode) {
    endLassoMode()
  }
  if (state.canvasPanMode) {
    updateCanvasPanMode(false)
  }
  const layerOptionButton = refs.layersList?.querySelector(
    `div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`
  )
  layerOptionButton?.classList.add('disabled')
  updateResizeMode(true, true)
  updateGcoMode(state.gcoMode, false)
  state.resizeModeMadeChanges = false
  editorCalls.toggleButton('undo', false)
  editorCalls.toggleButton('redo', false)
  editorCalls.toggleButton('clear', false)
  refs.resizeButton?.classList.toggle('selected', state.resizeMode)
  refs.visibilityLayerButton?.classList.add('disabled')
  refs.maskDownLayerButton?.classList.add('disabled')
  editorCalls.deselectPipette(true, false, true)
  if (refs.backgroundForResize) {
    refs.backgroundForResize.width = refs.backgroundForResize.height = 0
    refs.backgroundForResize = null
  }
  state.lassoTransformPoints = null
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
  editorFacade.showDragBox(
    round(minX + width / 2, 1),
    round(minY + height / 2, 1),
    width,
    height,
    true
  )
}

const saveResizeModeIfNeeded = async () => {
  editorFacade.flushPendingResizeFrame()
  const transformPoints = state.lassoTransformPoints
  if (state.resizeModeMadeChanges) {
    await layersBridge.addLayerHistoryContentChangedStep()
    layersBridge.updateUndoRedoButtons()
    if (Coworking.isOpen() && state.currentSelectedLayerId) {
      if (transformPoints) {
        Coworking.sendLassoTransformLayer(
          state.currentSelectedLayerId,
          transformPoints,
          state.lastResizeCoords.x,
          state.lastResizeCoords.y,
          state.lastResizeCoords.w,
          state.lastResizeCoords.h,
          state.lastResizeCoords.r
        )
      } else {
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
  }
  state.resizeModeMadeChanges = false
  refs.imageForResize = null
  if (refs.backgroundForResize) {
    refs.backgroundForResize.width = refs.backgroundForResize.height = 0
    refs.backgroundForResize = null
  }
  state.lassoTransformPoints = null
}

const endResizeMode = async () => {
  if (!state.currentSelectedLayerId) return
  const canBeResized = layerCanBeResized(state.currentSelectedLayerId)
  const layerOptionButton = refs.layersList?.querySelector(
    `div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`
  )
  layerOptionButton?.classList.remove('disabled')
  updateResizeMode(false, canBeResized)
  updateLassoMode(false, canBeResized)
  updateGcoMode(state.gcoMode, canBeResized)
  editorCalls.toggleButton('clear', true)
  await saveResizeModeIfNeeded()
  refs.visibilityLayerButton?.classList.remove('disabled')
  updateParamsByLayer(state.currentSelectedLayerId)
  refs.resizeButton?.classList.toggle('selected', state.resizeMode)
  state.lastResizeCoords = {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    r: 0,
  }
  editorFacade.hideDragBox()
  layersBridge.updateUndoRedoButtons()
}

export const closeResizeModeIfNeeded = () => {
  if (state && state.currentSelectedLayerId) {
    if (state.resizeMode) {
      void endResizeMode()
    }
    if (state.lassoMode) {
      endLassoMode()
    }
  }
}

export const updateCurrentTool = (isUsingEraser: boolean) => {
  if (state && state.currentSelectedLayerId) {
    state.editorIsUsingEraser = isUsingEraser
    updateGcoMode(state.gcoMode, layerCanBeResized(state.currentSelectedLayerId))
  }
}

const flipLayer = async (e: Event, layerId: string | false, horizontally: boolean) => {
  preventDefault(e)
  if (paramsAreClosed() || !layerId) {
    return
  }
  openParams()
  const layer = state.layers[layerId]
  if (layer && Number.isFinite(layer.maxX)) {
    if (state.resizeMode && refs.imageForResize) {
      editorFacade.flushPendingResizeFrame()
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
      await layersBridge.addLayerHistoryContentChangedStep()
      if (Coworking.isOpen()) {
        Coworking.sendFlipLayer(layerId, horizontally)
      }
    }
  }
}

export const flipVertically = (e: Event, layerId: string | false = state.currentSelectedLayerId) =>
  flipLayer(e, layerId, false)

export const flipHorizontally = (
  e: Event,
  layerId: string | false = state.currentSelectedLayerId
) => flipLayer(e, layerId, true)

export const canvasPanButtonTouchStart = (e: Event) => {
  preventDefault(e)
  closeParams()
  const next = !state.canvasPanMode
  if (next && state.resizeMode) {
    void endResizeMode()
  }
  if (next && state.lassoMode) {
    endLassoMode()
  }
  updateCanvasPanMode(next)
}

export const resizeButtonTouchStart = (e: Event) => {
  preventDefault(e)
  closeParams()
  if (!refs.resizeButton?.classList.contains('disabled')) {
    if (state.resizeMode) {
      void endResizeMode()
    } else {
      startResizeMode()
    }
  }
}

export const lassoButtonTouchStart = (e: Event) => {
  preventDefault(e)
  closeParams()
  if (!refs.lassoButton?.classList.contains('disabled')) {
    if (state.lassoMode) {
      endLassoMode()
    } else {
      void startLassoMode()
    }
  }
}

export const gcoModeTouchStart = (e: Event) => {
  preventDefault(e)
  closeParams()
  if (
    state.currentSelectedLayerId &&
    layerCanBeResized(state.currentSelectedLayerId) &&
    !state.resizeMode &&
    !state.lassoMode
  ) {
    updateGcoMode(!state.gcoMode, true)
  }
}

const _updateLayerOpacity = (layerId: string, opacity: number, inProgress = false) => {
  if (refs.opacityCursor) refs.opacityCursor.style.bottom = `${opacity}%`
  if (refs.opacityLabel) refs.opacityLabel.innerHTML = `${round(opacity, 0)}`
  if (refs.opacitySlider) {
    refs.opacitySlider.style.backgroundImage = `linear-gradient(0deg, var(--palette-gray-1) ${opacity}%, var(--palette-gray-6) ${opacity}%)`
  }
  const normalizedOpacity = round(opacity / 100, 2)
  state.layers[layerId].opacity = normalizedOpacity
  getLayerDomCanvas(state.layers[layerId]).style.opacity = String(normalizedOpacity)

  if (!inProgress) {
    const canBeResized = layerCanBeResized(layerId)
    const wasInResizeMode = state.resizeMode
    const wasInLassoMode = state.lassoMode
    updateResizeMode(state.resizeMode && canBeResized, canBeResized)
    updateLassoMode(state.lassoMode && canBeResized, canBeResized)
    updateGcoMode(state.gcoMode, !state.resizeMode && !state.lassoMode && canBeResized)
    if (wasInResizeMode && !state.resizeMode) {
      void endResizeMode()
    }
    if (wasInLassoMode && !state.lassoMode) {
      endLassoMode()
    }
  }
  updateEditorCanvas()
}

export const updateLayerOpacity = (() => {
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
      layersBridge.addLayerHistoryOpacityStep(state.currentSelectedLayerId, opacity, startValue)
      if (Coworking.isOpen()) {
        Coworking.sendOpacityLayer(state.currentSelectedLayerId, opacity, startValue)
      }
    }
  }
})()

const updateLayerOrger = (layerId: string, newOrder: number) => {
  if (!state.layers[layerId]) return
  const layers = Object.values(state.layers)
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
  layersBridge.reorderLayersList()
}

const onListDragChange = (draggedElement: HTMLElement, domOrder: number, inProgress = true) => {
  const layerId = draggedElement.getAttribute('data-id')
  if (!layerId) return
  const layers = Object.values(state.layers)
  const newOrder = layers.length - 1 - domOrder

  if (!inProgress) {
    if (newOrder !== state.listDragStartIndex) {
      layersBridge.addLayerHistoryOrderStep(layerId, newOrder, state.listDragStartIndex)
      if (Coworking.isOpen()) {
        Coworking.sendOrderDragLayer(layerId, newOrder, state.listDragStartIndex)
      }
    }
    state.listDragStartIndex = -1
  }

  updateLayerOrger(layerId, newOrder)
}

const startDragLayer = (e: Event, layerListDom: HTMLElement) => {
  closeParams()
  const id = layerListDom.getAttribute('data-id')
  if (!id || !refs.layersList) return
  state.listDragStartIndex = state.layers[id].order
  const expanded = Boolean(layerListDom.closest('.editor-layers__container--expanded'))
  if (expanded) layerListDom.classList.add('editor-layers__layer-drag-expanded')
  handleElementsListDragAndDrop(e, refs.layersList, layerListDom, onListDragChange, 'vertical')
  if (expanded) layerListDom.classList.remove('editor-layers__layer-drag-expanded')
}

const findListTargetLayerParent = (target: EventTarget | null): HTMLElement | false => {
  let node = target as HTMLElement | null
  if (!node || node === refs.layersList) return false
  while (node && !node.classList?.contains('editor-layers__layer')) {
    node = node.parentNode as HTMLElement | null
    if (!node || node === refs.layersList) return false
  }
  return node || false
}

const onLayerTouchDown = (layerId: string) => {
  if (isYourLayerYours(layerId)) {
    if (layerId === state.currentSelectedLayerId) {
      updateParamsByLayer(layerId)
      toggleParams()
    } else {
      layersBridge.selectLayer(layerId)
      openParams()
    }
  }
}

export const onListClick = (e: Event) => {
  const target = e.target as HTMLElement | null
  const layerListDom = findListTargetLayerParent(target)
  if (layerListDom && target) {
    const id = layerListDom.getAttribute('data-id')
    if (!id) return
    if (target.classList.contains('editor-layers__layer-options-button')) {
      layersBridge.toggleEnableLayer(e, id, true)
    } else {
      onLayerTouchDown(id)
    }
  }
}

export const isLayersSidebarExpanded = () =>
  Boolean(refs.layersContainer?.classList.contains('editor-layers__container--expanded'))

export const setLayersSidebarExpanded = (expanded: boolean) => {
  refs.layersContainer?.classList.toggle('editor-layers__container--expanded', expanded)
  refs.layersContainer?.parentElement?.classList.toggle('editor__layers-expanded', expanded)
  refs.layersToggleButton?.classList.toggle('selected', expanded)
}

export const layersToggleButtonTouchStart = (e: Event) => {
  preventDefault(e)
  closeParams()
  const expanded = !isLayersSidebarExpanded()
  setLayersSidebarExpanded(expanded)
  editorFacade.saveLayersSidebarExpanded(expanded)
}

export const onListLongPress = async (e: Event) => {
  e.preventDefault()
  if (Object.keys(state.layers).length > 1) {
    const layerListDom = findListTargetLayerParent(e.target)
    if (layerListDom) {
      const id = layerListDom.getAttribute('data-id')
      if (id) {
        await layersBridge.selectLayer(id)
        startDragLayer(e, layerListDom)
      }
    }
  }
}

export const onContainerTouchStart = (e: Event) => {
  if (e.target === refs.layersContainer) {
    preventDefault(e)
  }
}

registerLayersBridge({
  closeParams,
  endResizeMode,
  endLassoMode,
  openParams,
  paramsAreClosed,
  saveResizeModeIfNeeded,
  startResizeMode,
  updateEditorCanvas,
  updateGcoMode,
  updateParamsByLayer,
  updateResizeMode,
  updateLassoMode,
  updateLayerOrger,
  _updateLayerOpacity,
  updateLayerListMaskAffordances,
})
