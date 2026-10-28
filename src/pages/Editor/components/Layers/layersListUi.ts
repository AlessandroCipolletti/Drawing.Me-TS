import * as Coworking from 'modules/Coworking'
import Params from 'main/Params'
import { editorFacade } from 'pages/Editor/editorFacade'
import { preventDefault } from 'utils/domUtils'
import { round, convertAngleDegToRad } from 'utils/mathUtils'
import { cropImageWithMargin, flipImage } from 'utils/imageUtils'
import { fillCanvasWithImage } from 'utils/canvasUtils'
import {
  buildWarpDenseMesh,
  getAlphaBounds,
  getMeshBounds,
  getQuadBounds,
  readSourceImageData,
  warpMesh as renderWarpMesh,
  warpQuad,
} from 'utils/imageWarp'
import type { ResizeFramePayload } from 'pages/Editor/editorTypes'
import { cloneCanvasSource, getTransformBounds } from 'pages/Editor/resizeTransformSession'
import { handleElementsListDragAndDrop } from 'utils/uiUtils'
import { delay } from 'utils/jsUtils'
import { timing } from 'main/Theme'
import {
  config,
  state,
  refs,
  isYourLayerYours,
  layerCanBeResized,
  layerCanUseAdjust,
  layerCanUseLasso,
  findAdjustmentForTarget,
  updateMagnetismCoords,
} from './layersState'
import { syncAdjustBarFromLayer } from './layerAdjustmentPanel'
import { onLayerParamsClosed } from './layerAdjustPanelVisibility'
import { layersBridge, registerLayersBridge } from './layersBridge'
import { editorCalls } from 'pages/Editor/editorCalls'
import {
  canToggleMaskDown,
  findUpperLayerMaskedBy,
  getAdjacentMaskGroup,
  getLayerDomCanvas,
  isLayerInMaskPair,
  isLayerOccupiedByCoworker,
  paintLayerDisplay,
  refreshMaskDependents,
  syncLayerDisplay,
} from './layerMask'
import {
  applyBlendModeToDomCanvas,
  blendModeBadgeLetter,
  LAYER_BLEND_MODE_LABELS,
  nextBlendMode,
  normalizeBlendMode,
  type LayerBlendMode,
} from './layerBlendMode'
import {
  cancelMagicWandSession,
  completeMagicWandSession,
  createMagicWandSession,
  extractLassoSelection,
  LassoPoint,
  MagicWandSession,
  MagicWandUpdatePayload,
  requestMagicWandSessionTolerance,
} from './layerLasso'

const paramsAreClosed = () => state.paramsTimeout === false

const toggleParams = () => {
  if (refs.paramsContainer?.classList.contains('params-container-visible')) {
    closeParams()
  } else {
    openParamsDocked()
  }
}

const PARAMS_SCREEN_MARGIN = 8
let paramsPlaceGeneration = 0

const clearParamsPointerAnchor = () => {
  paramsPlaceGeneration += 1
  const el = refs.paramsContainer
  if (!el) return
  el.classList.remove('editor-layers__params-container--at-pointer')
  el.style.position = ''
  el.style.left = ''
  el.style.top = ''
  el.style.right = ''
  el.style.bottom = ''
  el.style.transform = ''
  el.style.zIndex = ''
  el.style.opacity = ''
  el.style.pointerEvents = ''
}

const placeParamsAtPointer = (clientX: number, clientY: number) => {
  const el = refs.paramsContainer
  if (!el) return
  paramsPlaceGeneration += 1
  el.classList.add('editor-layers__params-container--at-pointer')
  el.style.position = 'fixed'
  el.style.right = 'auto'
  el.style.bottom = 'auto'
  el.style.transform = 'none'
  el.style.zIndex = '4000'
  el.style.opacity = '1'
  el.style.pointerEvents = 'auto'
  el.style.left = '0px'
  el.style.top = '0px'
  const origin = el.getBoundingClientRect()
  const maxLeft = window.innerWidth - origin.width - PARAMS_SCREEN_MARGIN
  const maxTop = window.innerHeight - origin.height - PARAMS_SCREEN_MARGIN
  const left = Math.max(PARAMS_SCREEN_MARGIN, Math.min(clientX - origin.width / 2, maxLeft))
  const top = Math.max(PARAMS_SCREEN_MARGIN, Math.min(clientY - origin.height / 2, maxTop))
  el.style.left = `${left - origin.left}px`
  el.style.top = `${top - origin.top}px`
}

const openParams = async () => {
  if (state.paramsTimeout !== false) {
    clearTimeout(state.paramsTimeout)
  }
  state.paramsTimeout = setTimeout(closeParams, config.paramsCloseDelay)
  refs.paramsContainer?.classList.add('params-container-visible')
}

const paramsAnchoredAtPointer = () =>
  Boolean(refs.paramsContainer?.classList.contains('editor-layers__params-container--at-pointer'))

const openParamsDocked = () => {
  clearParamsPointerAnchor()
  void openParams()
}

export const closeParams = async () => {
  if (state.paramsTimeout !== false) {
    const generation = paramsPlaceGeneration
    const el = refs.paramsContainer
    const anchoredAtPointer = Boolean(
      el?.classList.contains('editor-layers__params-container--at-pointer')
    )
    if (anchoredAtPointer && el) {
      el.style.transition = 'none'
      el.classList.remove('params-container-visible')
      clearParamsPointerAnchor()
      void el.offsetWidth
      el.style.transition = ''
    } else {
      el?.classList.remove('params-container-visible')
    }
    clearTimeout(state.paramsTimeout)
    state.paramsTimeout = false
    onLayerParamsClosed()
    await delay(parseInt(timing.OPTIONS_SHOW_TRANSITION, 10))
    if (!anchoredAtPointer && generation === paramsPlaceGeneration) clearParamsPointerAnchor()
  }
}

export const closePointerAnchoredParams = () => {
  if (!paramsAnchoredAtPointer()) return
  void closeParams()
}

const updateLayerListBlendBadges = () => {
  if (!refs.layersList) return
  refs.layersList.querySelectorAll('.editor-layers__layer-blend-badge').forEach((badge) => {
    badge.classList.add('displayNone')
    badge.textContent = ''
    badge.removeAttribute('aria-label')
    badge.setAttribute('aria-hidden', 'true')
  })
  Object.values(state.layers).forEach((layer) => {
    const letter = blendModeBadgeLetter(layer.blendMode)
    if (!letter) return
    const badge = refs.layersList?.querySelector(
      `div[data-id="${layer.id}"] .editor-layers__layer-blend-badge`
    )
    if (!badge) return
    badge.textContent = letter
    badge.setAttribute(
      'aria-label',
      `Blend mode ${LAYER_BLEND_MODE_LABELS[normalizeBlendMode(layer.blendMode)]}`
    )
    badge.classList.remove('displayNone')
    badge.removeAttribute('aria-hidden')
  })
}

const updateLayerListMaskAffordances = () => {
  if (!refs.layersList) return
  refs.layersList.querySelectorAll('.editor-layers__layer').forEach((row) => {
    row.classList.remove(
      'editor-layers__layer--mask-upper',
      'editor-layers__layer--mask-lower',
      'editor-layers__layer-occupied'
    )
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
      upperLabel.textContent = layer.layerKind === 'adjustment' ? 'Adjust' : 'Clip'
      upperLabel.classList.remove('displayNone')
    }
    const lowerLabel = lowerRow?.querySelector('.editor-layers__layer-mask-label')
    if (lowerLabel) {
      lowerLabel.textContent = 'Mask'
      lowerLabel.classList.remove('displayNone')
    }
  })
  Object.values(state.layers).forEach((layer) => {
    if (!isLayerInMaskPair(layer.id) || !isLayerOccupiedByCoworker(layer.id)) return
    refs.layersList
      ?.querySelector(`div[data-id="${layer.id}"]`)
      ?.classList.add('editor-layers__layer-occupied')
  })
  updateLayerListBlendBadges()
}

const updateEditorCanvas = () => {
  if (state.currentSelectedLayerId && state.layers[state.currentSelectedLayerId]) {
    const domCanvas = getLayerDomCanvas(state.layers[state.currentSelectedLayerId])
    const selectedLayer = state.layers[state.currentSelectedLayerId]
    editorFacade.updateEditorLayer(
      parseInt(domCanvas.style.zIndex, 10),
      selectedLayer.opacity,
      state.gcoMode ? 'source-atop' : 'source-over',
      selectedLayer.active && selectedLayer.layerKind !== 'adjustment'
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

let activeMagicWandSession: MagicWandSession | null = null
let wandStrokeEpoch = 0

export const cancelMagicWandSelection = () => {
  if (activeMagicWandSession) {
    cancelMagicWandSession(activeMagicWandSession)
    activeMagicWandSession = null
  }
  wandStrokeEpoch += 1
}

export const discardPendingLassoSelection = () => {
  if (activeMagicWandSession) {
    cancelMagicWandSession(activeMagicWandSession)
    activeMagicWandSession = null
  }
  if (state.lassoSelection) {
    state.lassoSelection.selectedCanvas.width = state.lassoSelection.selectedCanvas.height = 0
    state.lassoSelection.outsideCanvas.width = state.lassoSelection.outsideCanvas.height = 0
    if (state.lassoSelection.maskCanvas) {
      state.lassoSelection.maskCanvas.width = state.lassoSelection.maskCanvas.height = 0
    }
    state.lassoSelection = null
  }
  state.lassoHistoryDepth = 0
}

export const hasActiveLassoSelection = (): boolean =>
  Boolean(state.lassoMode && state.lassoSelection && state.lassoSelection.points.length >= 3)

export const getActiveLassoSelection = () => (state.lassoMode ? state.lassoSelection : null)

export const canCreateLayerFromLasso = (): boolean =>
  Object.keys(state.layers).length < config.maxLayersNumber

const updateLassoMode = (selected: boolean, active: boolean) => {
  refs.lassoButton?.classList.toggle('disabled', !active)
  const modeChanged = selected !== state.lassoMode
  state.lassoMode = selected
  if (!selected) {
    state.wandMode = false
    state.lassoArmed = false
  }
  refs.lassoButton?.classList.toggle('selected', selected && state.lassoArmed && !state.wandMode)
  if (modeChanged || (selected && !state.lassoSelection)) {
    editorFacade.setLassoModeActive(selected, state.wandMode)
  }
  if (!selected && modeChanged) {
    discardPendingLassoSelection()
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
    const canUseLasso = layerCanUseLasso(layerId)
    const canBeDeleted = yourLayers.length > 1
    const opacity = round(layer.opacity * 100, 0)
    const canMergeAdjustment =
      layer.layerKind === 'adjustment' &&
      Boolean(layer.maskBelowLayerId && state.layers[layer.maskBelowLayerId])
    const canMergeDown =
      canMergeAdjustment ||
      (!empty &&
        !layer.maskBelowLayerId &&
        !findUpperLayerMaskedBy(layer.id) &&
        yourLayers.length > 1 &&
        layer.order > 0 &&
        Object.values(state.layers).find((l) => l.order === layer.order - 1)?.owner ===
          Coworking.getUserId())
    const canAdjust =
      layerCanUseAdjust(layerId) &&
      !state.resizeMode &&
      !state.lassoMode &&
      !isLayerOccupiedByCoworker(layerId)
    const hasLinkedAdjust = Boolean(findAdjustmentForTarget(layerId))
    const canUseFx =
      (canAdjust || layer.layerKind === 'adjustment' || hasLinkedAdjust) &&
      !state.resizeMode &&
      !state.lassoMode &&
      !isLayerOccupiedByCoworker(layerId)
    refs.adjustParamsButton?.classList.toggle('disabled', !canUseFx)
    refs.adjustParamsButton?.classList.toggle('selected', state.adjustPanelOpen)
    if (state.adjustPanelOpen && state.adjustBarMode === 'edit') syncAdjustBarFromLayer()
    const canMaskDown = canToggleMaskDown(layerId)
    const maskActive = Boolean(layer.maskBelowLayerId)
    const canDuplicate =
      !empty &&
      layer.layerKind !== 'adjustment' &&
      Object.values(state.layers).length < config.maxLayersNumber
    const canTransferLayer =
      Coworking.isOpen() && yourLayers.length > 1 && layer.active && !isLayerInMaskPair(layerId)

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
      state.resizeMode || state.lassoMode || !canMaskDown
    )
    refs.maskDownLayerButton?.classList.toggle('selected', maskActive)
    refs.flipVerticalButton?.classList.toggle('disabled', empty)
    refs.flipHorizontalButton?.classList.toggle('disabled', empty)
    refs.sendLayerButton?.classList.toggle('disabled', !canTransferLayer)
    const blendMode = normalizeBlendMode(layer.blendMode)
    if (refs.blendModeChip) {
      refs.blendModeChip.textContent = LAYER_BLEND_MODE_LABELS[blendMode]
      refs.blendModeChip.setAttribute(
        'aria-label',
        `Blend mode, ${LAYER_BLEND_MODE_LABELS[blendMode]}`
      )
      const blendDisabled =
        empty || state.resizeMode || state.lassoMode || isLayerOccupiedByCoworker(layerId)
      refs.blendModeChip.classList.toggle('disabled', blendDisabled)
      refs.blendModeChip.toggleAttribute('disabled', blendDisabled)
      refs.blendModeChip.classList.toggle('selected', blendMode !== 'normal')
    }
    const wasInResizeMode = state.resizeMode
    const wasInLassoMode = state.lassoMode
    updateResizeMode(state.resizeMode && canBeResized, canBeResized)
    updateLassoMode(state.lassoMode && canUseLasso, canUseLasso)
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

const paintTransformFrame = (ctx: CanvasRenderingContext2D) => {
  if (!refs.imageForResize) return
  const frame = state.lastResizeCoords
  const source = refs.resizeBaseSnapshot || refs.imageForResize
  const { x, y, w, h, r, transformKind, quad, warpMesh } = frame
  const minX = round(x - w / 2, 1)
  const minY = round(y - h / 2, 1)
  const rotation = convertAngleDegToRad(r)
  // Drag preview: render the warp at reduced resolution (capped long edge)
  // and let drawImage upscale it. Release/commit renders at full resolution.
  const previewMaxDimension = Params.isTablet || Params.isPhone ? 560 : 720
  const getPreviewScale = (width: number, height: number) => {
    if (!frame.previewCoarse) return 1
    const longest = Math.max(width, height)
    return longest > 0 ? Math.min(1, previewMaxDimension / longest) : 1
  }
  const paintWarpResult = (
    warped: HTMLCanvasElement,
    boundsMinX: number,
    boundsMinY: number,
    boundsW?: number,
    boundsH?: number
  ) => {
    const scaled = boundsW !== undefined && boundsH !== undefined
    if (refs.backgroundForResize) {
      fillCanvasWithImage(ctx, refs.backgroundForResize, 0, 0)
      fillCanvasWithImage(
        ctx,
        warped,
        boundsMinX,
        boundsMinY,
        scaled ? boundsW : undefined,
        scaled ? boundsH : undefined,
        undefined,
        false
      )
    } else if (scaled) {
      fillCanvasWithImage(ctx, warped, boundsMinX, boundsMinY, boundsW, boundsH)
    } else {
      fillCanvasWithImage(ctx, warped, boundsMinX, boundsMinY)
    }
  }
  if (
    (transformKind === 'distort' || transformKind === 'perspective') &&
    quad &&
    source.width > 0 &&
    source.height > 0
  ) {
    const qb = getQuadBounds(quad)
    const qbW = qb.maxX - qb.minX
    const qbH = qb.maxY - qb.minY
    const warped = warpQuad(
      source,
      { minX: 0, minY: 0, maxX: source.width, maxY: source.height },
      quad,
      {
        sourcePixels: refs.resizeWarpSourcePixels ?? undefined,
        previewScale: getPreviewScale(qbW, qbH),
      }
    )
    paintWarpResult(warped, qb.minX, qb.minY, qbW, qbH)
    return
  }
  if (transformKind === 'warp' && warpMesh && source.width > 0 && source.height > 0) {
    // Same subdivision count in drag preview and final save: using fewer
    // subdivisions while dragging approximated the Catmull-Rom surface
    // differently, so the HD result visibly shifted from the preview.
    const subdivisions = 8
    const dense = buildWarpDenseMesh(warpMesh, subdivisions)
    const mb = getMeshBounds(dense.points)
    const mbW = mb.maxX - mb.minX
    const mbH = mb.maxY - mb.minY
    const warped = renderWarpMesh(
      source,
      { minX: 0, minY: 0, maxX: source.width, maxY: source.height },
      warpMesh,
      {
        sourcePixels: refs.resizeWarpSourcePixels ?? undefined,
        previewScale: getPreviewScale(mbW, mbH),
        subdivisionsPerCell: subdivisions,
        denseMesh: dense,
      }
    )
    paintWarpResult(warped, mb.minX, mb.minY, mbW, mbH)
    return
  }
  if (refs.backgroundForResize) {
    fillCanvasWithImage(ctx, refs.backgroundForResize, 0, 0)
    fillCanvasWithImage(ctx, refs.imageForResize, minX, minY, w, h, rotation, false)
  } else {
    fillCanvasWithImage(ctx, refs.imageForResize, minX, minY, w, h, rotation)
  }
}

/** Flatten current transform preview into a new working bitmap (no history step). */
export const bakeResizeSessionWorkingPixels = (): {
  x: number
  y: number
  w: number
  h: number
  r: number
} | null => {
  if (!refs.imageForResize || !state.currentSelectedLayerId) return null
  const layer = state.layers[state.currentSelectedLayerId]
  if (!layer) return null
  const frame = {
    ...state.lastResizeCoords,
    previewCoarse: false,
  }
  state.lastResizeCoords = frame
  const temp = document.createElement('canvas')
  temp.width = layer.canvas.width
  temp.height = layer.canvas.height
  const tempCtx = temp.getContext('2d')
  if (!tempCtx) return null
  paintTransformFrame(tempCtx)
  const bounds = getTransformBounds(
    frame.transformKind,
    frame.x,
    frame.y,
    frame.w,
    frame.h,
    frame.r,
    frame.quad,
    frame.warpMesh
  )
  const cropW = Math.max(1, Math.ceil(bounds.maxX - bounds.minX))
  const cropH = Math.max(1, Math.ceil(bounds.maxY - bounds.minY))
  const crop = document.createElement('canvas')
  crop.width = cropW
  crop.height = cropH
  const cropCtx = crop.getContext('2d', { willReadFrequently: true })!
  cropCtx.drawImage(temp, bounds.minX, bounds.minY, cropW, cropH, 0, 0, cropW, cropH)
  if (refs.backgroundForResize) {
    const flat = document.createElement('canvas')
    flat.width = temp.width
    flat.height = temp.height
    const flatCtx = flat.getContext('2d')!
    flatCtx.drawImage(refs.backgroundForResize, 0, 0)
    flatCtx.drawImage(crop, bounds.minX, bounds.minY)
    refs.backgroundForResize = flat
  }
  // Re-tighten around actual pixels: after a shrink/distort the geometric box
  // can be mostly transparent, so the next tool would waste most of its range.
  let workingCrop = crop
  let effectiveMinX = bounds.minX
  let effectiveMinY = bounds.minY
  let effectiveW = cropW
  let effectiveH = cropH
  const tight = getAlphaBounds(cropCtx.getImageData(0, 0, cropW, cropH))
  if (tight) {
    effectiveMinX = bounds.minX + tight.minX
    effectiveMinY = bounds.minY + tight.minY
    effectiveW = tight.maxX - tight.minX + 1
    effectiveH = tight.maxY - tight.minY + 1
    if (effectiveW !== cropW || effectiveH !== cropH) {
      workingCrop = document.createElement('canvas')
      workingCrop.width = effectiveW
      workingCrop.height = effectiveH
      workingCrop
        .getContext('2d')!
        .drawImage(
          crop,
          tight.minX,
          tight.minY,
          effectiveW,
          effectiveH,
          0,
          0,
          effectiveW,
          effectiveH
        )
    }
  }
  refs.imageForResize = workingCrop
  refs.resizeBaseSnapshot = cloneCanvasSource(workingCrop)
  refs.resizeWarpSourcePixels = readSourceImageData(refs.resizeBaseSnapshot)
  const next = {
    x: round(effectiveMinX + effectiveW / 2, 1),
    y: round(effectiveMinY + effectiveH / 2, 1),
    w: round(effectiveW, 1),
    h: round(effectiveH, 1),
    r: 0,
  }
  state.lastResizeCoords = {
    ...next,
    transformKind: frame.transformKind,
    quad: null,
    warpMesh: null,
    previewCoarse: false,
  }
  return next
}

export const confirmResizeModeFromToolbar = () => {
  if (state.resizeMode) {
    void endResizeMode()
  }
}

export const updateCanvasContent = (madeChanges: boolean, frame: ResizeFramePayload) => {
  state.lastResizeCoords = { ...frame }
  if (state.currentSelectedLayerId && refs.imageForResize) {
    paintLayerDisplay(state.currentSelectedLayerId, paintTransformFrame)
  }
  if (madeChanges) {
    editorCalls.toggleButton('undo', true)
    state.resizeModeMadeChanges = true
  }
}

const rememberLassoFloatBase = (points: LassoPoint[], rings?: LassoPoint[][]) => {
  state.lassoFloatBasePoints = points.map(([x, y]) => [x, y])
  state.lassoFloatBaseRings = rings ? rings.map((r) => r.map(([x, y]) => [x, y])) : null
  state.lassoFloatDirty = false
}

const previewLassoFloat = (dx = 0, dy = 0) => {
  if (!state.currentSelectedLayerId || !state.lassoSelection) return
  const selection = state.lassoSelection
  const layerId = state.currentSelectedLayerId
  paintLayerDisplay(layerId, (ctx) => {
    fillCanvasWithImage(ctx, selection.outsideCanvas, 0, 0)
    fillCanvasWithImage(
      ctx,
      selection.selectedCanvas,
      round(selection.minX + dx, 1),
      round(selection.minY + dy, 1),
      undefined,
      undefined,
      undefined,
      false
    )
  })
}

export const hasPendingLassoFloat = () => Boolean(state.lassoFloatDirty && state.lassoSelection)

export const commitPendingLassoFloat = (recordHistory = true) => {
  if (!state.lassoFloatDirty || !state.currentSelectedLayerId || !state.lassoSelection) return
  const layerId = state.currentSelectedLayerId
  const layer = state.layers[layerId]
  const selection = state.lassoSelection
  if (!layer) return
  const basePoints = state.lassoFloatBasePoints || selection.points
  fillCanvasWithImage(layer.canvas.context, selection.outsideCanvas, 0, 0)
  fillCanvasWithImage(
    layer.canvas.context,
    selection.selectedCanvas,
    selection.minX,
    selection.minY,
    undefined,
    undefined,
    undefined,
    false
  )
  state.lassoFloatDirty = false
  syncLayerDisplay(layerId)
  refreshMaskDependents(layerId)
  const centerX = round(selection.minX + selection.width / 2, 1)
  const centerY = round(selection.minY + selection.height / 2, 1)
  if (recordHistory) {
    void layersBridge.addLayerHistoryContentChangedStep(layerId)
  }
  if (Coworking.isOpen()) {
    const baseRings = state.lassoFloatBaseRings || selection.rings
    Coworking.sendLassoTransformLayer(
      layerId,
      basePoints,
      centerX,
      centerY,
      selection.width,
      selection.height,
      0,
      selection.inverted,
      baseRings
    )
  }
}

const endLassoMode = (applyPending = true) => {
  const selectionStillHere = Boolean(state.lassoSelection)
  if (applyPending) {
    commitPendingLassoFloat(true)
  } else if (selectionStillHere) {
    state.lassoFloatDirty = false
  }
  discardPendingLassoSelection()
  if ((applyPending || selectionStillHere) && state.currentSelectedLayerId) {
    syncLayerDisplay(state.currentSelectedLayerId)
  }
  editorFacade.setLassoModeActive(false)
  if (state.currentSelectedLayerId && state.layers[state.currentSelectedLayerId]) {
    const canBeResized = layerCanBeResized(state.currentSelectedLayerId)
    const canUseLasso = layerCanUseLasso(state.currentSelectedLayerId)
    const layerOptionButton = refs.layersList?.querySelector(
      `div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`
    )
    if (!state.resizeMode) {
      layerOptionButton?.classList.remove('disabled')
      refs.visibilityLayerButton?.classList.remove('disabled')
      editorCalls.toggleButton('clear', true)
    }
    updateLassoMode(false, canUseLasso)
    updateGcoMode(state.gcoMode, !state.resizeMode && canBeResized)
    updateParamsByLayer(state.currentSelectedLayerId)
  } else {
    updateLassoMode(false, false)
  }
  layersBridge.updateUndoRedoButtons()
}

const startLassoMode = async (isWand = false) => {
  if (!state.currentSelectedLayerId) return
  if (state.canvasPanMode) {
    updateCanvasPanMode(false)
  }
  if (state.resizeMode) {
    await endResizeMode()
  }
  state.wandMode = isWand
  state.lassoArmed = !isWand
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

export const syncMagicWandTool = (active: boolean) => {
  if (active) {
    if (state.wandMode && state.lassoMode) return
    if (state.lassoMode) {
      state.wandMode = true
      state.lassoArmed = false
      refs.lassoButton?.classList.remove('selected')
      editorFacade.setLassoModeIsWand(true)
      editorFacade.setLassoInputCapture(true)
      return
    }
    void startLassoMode(true)
    return
  }
  if (!state.wandMode) return
  if (hasActiveLassoSelection() && state.lassoSelection) {
    const selection = state.lassoSelection
    state.wandMode = false
    state.lassoArmed = false
    refs.lassoButton?.classList.remove('selected')
    editorFacade.setLassoModeIsWand(false)
    editorFacade.setLassoInputCapture(false)
    editorFacade.updateLassoSelectionUi({
      minX: selection.minX,
      minY: selection.minY,
      maxX: selection.maxX,
      maxY: selection.maxY,
      hasPixels: selection.hasPixels,
      inverted: selection.inverted,
      points: selection.points,
      rings: selection.rings,
    })
    return
  }
  endLassoMode()
}

export const prepareMagicWandStroke = async () => {
  const epoch = wandStrokeEpoch
  if (state.resizeMode) {
    await endResizeMode()
  }
  if (epoch !== wandStrokeEpoch) return false
  if (hasPendingLassoFloat()) {
    commitPendingLassoFloat(true)
  }
  discardPendingLassoSelection()
  if (epoch !== wandStrokeEpoch) return false
  if (!state.lassoMode || !state.wandMode) {
    await startLassoMode(true)
  }
  return epoch === wandStrokeEpoch
}

export const beginMagicWandSelection = (
  x: number,
  y: number,
  onUpdate?: (payload: MagicWandUpdatePayload) => void
): { points: LassoPoint[]; rings: LassoPoint[][] } | null => {
  if (!state.currentSelectedLayerId || !state.lassoMode) return null
  const layer = state.layers[state.currentSelectedLayerId]
  if (!layer || !layerCanUseLasso(layer.id)) return null
  if (activeMagicWandSession) {
    cancelMagicWandSession(activeMagicWandSession)
    activeMagicWandSession = null
  }
  syncLayerDisplay(layer.id)
  const session = createMagicWandSession(getLayerDomCanvas(layer), x, y, onUpdate)
  if (!session) return null
  activeMagicWandSession = session
  return { points: session.points, rings: session.rings }
}

export const updateMagicWandSelectionTolerance = (tolerance: number) => {
  if (!activeMagicWandSession) return
  requestMagicWandSessionTolerance(activeMagicWandSession, tolerance)
}

export const completeMagicWandSelection = async (tolerance: number) => {
  const session = activeMagicWandSession
  if (!session) return null
  activeMagicWandSession = null
  const { points, rings } = await completeMagicWandSession(session, tolerance)
  if (points.length < 3) return null
  return completeLassoSelection(points, rings)
}

export const completeLassoSelection = async (
  points: LassoPoint[],
  rings?: LassoPoint[][]
): Promise<{
  minX: number
  minY: number
  maxX: number
  maxY: number
  hasPixels: boolean
  inverted: boolean
  points: LassoPoint[]
  rings?: LassoPoint[][]
} | null> => {
  if (!state.currentSelectedLayerId || !state.lassoMode) return null
  const layer = state.layers[state.currentSelectedLayerId]
  if (!layer || !layerCanUseLasso(layer.id)) return null
  syncLayerDisplay(layer.id)
  const result = await extractLassoSelection(layer.canvas, points, getLayerDomCanvas(layer), {
    inverted: false,
    rings,
  })
  if (!result || !state.lassoMode) {
    if (result) {
      result.selectedCanvas.width = result.selectedCanvas.height = 0
      result.outsideCanvas.width = result.outsideCanvas.height = 0
      result.maskCanvas.width = result.maskCanvas.height = 0
    }
    return null
  }
  discardPendingLassoSelection()
  state.lassoSelection = result
  rememberLassoFloatBase(result.points, result.rings)
  state.lassoHistoryDepth = 0
  layersBridge.updateUndoRedoButtons()
  return {
    minX: result.minX,
    minY: result.minY,
    maxX: result.maxX,
    maxY: result.maxY,
    hasPixels: result.hasPixels,
    inverted: result.inverted,
    points: result.points,
    rings: result.rings,
  }
}

export const refreshActiveLassoSelection = async () => {
  if (!state.currentSelectedLayerId || !state.lassoMode || !state.lassoSelection) return null
  if (state.lassoFloatDirty) {
    commitPendingLassoFloat(true)
  }
  const layer = state.layers[state.currentSelectedLayerId]
  if (!layer) return null
  const { points, rings, inverted } = state.lassoSelection
  syncLayerDisplay(layer.id)
  const result = await extractLassoSelection(layer.canvas, points, getLayerDomCanvas(layer), {
    inverted,
    rings,
  })
  if (!result || !state.lassoMode) {
    if (result) {
      result.selectedCanvas.width = result.selectedCanvas.height = 0
      result.outsideCanvas.width = result.outsideCanvas.height = 0
      result.maskCanvas.width = result.maskCanvas.height = 0
    }
    return null
  }
  const prevDepth = state.lassoHistoryDepth
  discardPendingLassoSelection()
  state.lassoSelection = result
  rememberLassoFloatBase(result.points, result.rings)
  state.lassoHistoryDepth = prevDepth
  const bounds = {
    minX: result.minX,
    minY: result.minY,
    maxX: result.maxX,
    maxY: result.maxY,
    hasPixels: result.hasPixels,
    inverted: result.inverted,
    points: result.points,
    rings: result.rings,
  }
  editorFacade.updateLassoSelectionUi(bounds)
  layersBridge.updateUndoRedoButtons()
  return bounds
}

export const updateLassoSelectionOptions = async (inverted: boolean) => {
  if (!state.currentSelectedLayerId || !state.lassoMode || !state.lassoSelection) return null
  state.lassoSelection.inverted = inverted
  return refreshActiveLassoSelection()
}

export const translateLassoSelectionInPlace = (dx: number, dy: number) => {
  if (!state.currentSelectedLayerId || !state.lassoMode || !state.lassoSelection) return
  previewLassoFloat(dx, dy)
}

export const commitLassoMoveSelectionInPlace = async (dx: number, dy: number) => {
  if (!state.currentSelectedLayerId || !state.lassoMode || !state.lassoSelection) return null
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    previewLassoFloat(0, 0)
    return null
  }
  const selection = state.lassoSelection
  selection.points = selection.points.map(([px, py]) => [round(px + dx, 1), round(py + dy, 1)])
  if (selection.rings) {
    selection.rings = selection.rings.map((ring) =>
      ring.map(([px, py]) => [round(px + dx, 1), round(py + dy, 1)] as LassoPoint)
    )
  }
  selection.minX = round(selection.minX + dx, 1)
  selection.minY = round(selection.minY + dy, 1)
  selection.maxX = round(selection.maxX + dx, 1)
  selection.maxY = round(selection.maxY + dy, 1)
  state.lassoFloatDirty = true
  previewLassoFloat(0, 0)
  return {
    minX: selection.minX,
    minY: selection.minY,
    maxX: selection.maxX,
    maxY: selection.maxY,
    hasPixels: selection.hasPixels,
    inverted: selection.inverted,
  }
}

export const cancelLassoSelection = () => {
  if (state.lassoMode) {
    endLassoMode()
  }
}

export const startTransformLassoSelectionInPlace = () => {
  if (!state.currentSelectedLayerId || !state.lassoSelection || !state.lassoSelection.hasPixels) {
    return
  }
  const selection = state.lassoSelection
  state.lassoSelection = null
  state.lassoHistoryDepth = 0
  if (selection.maskCanvas) {
    selection.maskCanvas.width = selection.maskCanvas.height = 0
  }
  endLassoMode(false)
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
  if (refs.resizeBaseSnapshot) {
    refs.resizeBaseSnapshot.width = refs.resizeBaseSnapshot.height = 0
  }
  refs.resizeBaseSnapshot = cloneCanvasSource(selection.selectedCanvas)
  refs.resizeWarpSourcePixels = readSourceImageData(refs.resizeBaseSnapshot)
  refs.backgroundForResize = selection.outsideCanvas
  state.lassoTransformPoints = (state.lassoFloatBasePoints || selection.points).map(([x, y]) => [
    x,
    y,
  ])
  const baseRings = state.lassoFloatBaseRings || selection.rings
  state.lassoTransformOptions = {
    inverted: selection.inverted,
    rings: baseRings ? baseRings.map((ring) => ring.map(([x, y]) => [x, y])) : undefined,
  }
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
  state.lassoTransformOptions = null
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
  if (refs.resizeBaseSnapshot) {
    refs.resizeBaseSnapshot.width = refs.resizeBaseSnapshot.height = 0
  }
  refs.resizeBaseSnapshot = cloneCanvasSource(image)
  refs.resizeWarpSourcePixels = readSourceImageData(refs.resizeBaseSnapshot)
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
  const transformOptions = state.lassoTransformOptions
  const shouldBakeResize =
    Boolean(refs.imageForResize) && (state.resizeModeMadeChanges || state.lassoFloatDirty)
  if (shouldBakeResize && state.currentSelectedLayerId) {
    const layer = state.layers[state.currentSelectedLayerId]
    if (layer) {
      state.lastResizeCoords = { ...state.lastResizeCoords, previewCoarse: false }
      paintTransformFrame(layer.canvas.context)
      state.lassoFloatDirty = false
      syncLayerDisplay(state.currentSelectedLayerId)
      refreshMaskDependents(state.currentSelectedLayerId)
    }
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
          state.lastResizeCoords.r,
          transformOptions?.inverted,
          transformOptions?.rings
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
  } else if (state.currentSelectedLayerId) {
    state.lassoFloatDirty = false
    syncLayerDisplay(state.currentSelectedLayerId)
  }
  state.resizeModeMadeChanges = false
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
}

const endResizeMode = async () => {
  if (!state.currentSelectedLayerId) return
  const canBeResized = layerCanBeResized(state.currentSelectedLayerId)
  const canUseLasso = layerCanUseLasso(state.currentSelectedLayerId)
  const layerOptionButton = refs.layersList?.querySelector(
    `div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`
  )
  layerOptionButton?.classList.remove('disabled')
  updateResizeMode(false, canBeResized)
  updateLassoMode(false, canUseLasso)
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
    transformKind: 'resize',
    quad: null,
    warpMesh: null,
  }
  editorFacade.hideDragBox()
  layersBridge.updateUndoRedoButtons()
}

export const closeResizeModeIfNeeded = () => {
  if (state && state.currentSelectedLayerId) {
    if (state.resizeMode) {
      void endResizeMode()
    }
    if (state.lassoMode && !state.lassoSelection) {
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
      updateCanvasContent(true, { ...state.lastResizeCoords })
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
    if (state.wandMode) {
      editorCalls.selectLastUsedTool(false)
    }
    if (state.lassoArmed && !state.wandMode) {
      endLassoMode()
    } else {
      if (state.lassoMode) {
        endLassoMode()
      }
      void startLassoMode(false)
    }
  }
}

export const gcoModeTouchStart = (e: Event) => {
  preventDefault(e)
  closeParams()
  if (
    state.currentSelectedLayerId &&
    layerCanBeResized(state.currentSelectedLayerId) &&
    !state.editorIsUsingEraser &&
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
    const canUseLasso = layerCanUseLasso(layerId)
    const wasInResizeMode = state.resizeMode
    const wasInLassoMode = state.lassoMode
    updateResizeMode(state.resizeMode && canBeResized, canBeResized)
    updateLassoMode(state.lassoMode && canUseLasso, canUseLasso)
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

const _updateLayerBlendMode = (layerId: string, blendMode: LayerBlendMode) => {
  const layer = state.layers[layerId]
  if (!layer) return
  layer.blendMode = blendMode
  applyBlendModeToDomCanvas(getLayerDomCanvas(layer), blendMode)
  if (refs.blendModeChip && layerId === state.currentSelectedLayerId) {
    refs.blendModeChip.textContent = LAYER_BLEND_MODE_LABELS[blendMode]
    refs.blendModeChip.setAttribute(
      'aria-label',
      `Blend mode, ${LAYER_BLEND_MODE_LABELS[blendMode]}`
    )
    refs.blendModeChip.classList.toggle('selected', blendMode !== 'normal')
  }
  updateLayerListBlendBadges()
}

export const blendModeChipTouchStart = (e: Event) => {
  preventDefault(e)
  const layerId = state.currentSelectedLayerId
  if (
    !layerId ||
    !isYourLayerYours(layerId) ||
    isLayerOccupiedByCoworker(layerId) ||
    refs.blendModeChip?.classList.contains('disabled') ||
    state.resizeMode ||
    state.lassoMode
  ) {
    return
  }
  openParams()
  const oldMode = normalizeBlendMode(state.layers[layerId].blendMode)
  const newMode = nextBlendMode(oldMode)
  _updateLayerBlendMode(layerId, newMode)
  layersBridge.addLayerHistoryBlendModeStep(layerId, newMode, oldMode)
  if (Coworking.isOpen()) {
    Coworking.sendBlendLayer(layerId, newMode, oldMode)
  }
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
    if (!(paramsAnchoredAtPointer() && !inProgress)) openParams()
    _updateLayerOpacity(state.currentSelectedLayerId, opacity, inProgress)
    if (!inProgress && paramsAnchoredAtPointer()) closePointerAnchoredParams()
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

const layersByOrder = () => Object.values(state.layers).sort((a, b) => a.order - b.order)

const isMaskPair = (
  lower: { id: string; order: number },
  upper: { id: string; order: number; maskBelowLayerId: string | null }
) => upper.maskBelowLayerId === lower.id && upper.order === lower.order + 1

const snapTargetOrder = (layerId: string, targetOrder: number) => {
  if (!state.layers[layerId]) return targetOrder
  const without = layersByOrder().filter((layer) => layer.id !== layerId)
  const current = state.layers[layerId].order
  let target = Math.max(0, Math.min(without.length, targetOrder))
  let guard = 0
  while (guard++ < without.length) {
    const before = without[target - 1]
    const after = without[target]
    if (!before || !after || !isMaskPair(before, after)) break
    target += current > after.order ? 1 : -1
    target = Math.max(0, Math.min(without.length, target))
  }
  return target
}

const snapGroupUpperOrder = (upperId: string, lowerId: string, upperOrder: number) => {
  if (!state.layers[upperId] || !state.layers[lowerId]) return upperOrder
  const others = layersByOrder().filter((layer) => layer.id !== upperId && layer.id !== lowerId)
  const currentLowerOrder = state.layers[lowerId].order
  let belowCount = Math.max(0, Math.min(others.length, upperOrder - 1))
  let guard = 0
  while (guard++ < others.length) {
    const before = others[belowCount - 1]
    const after = others[belowCount]
    if (!before || !after || !isMaskPair(before, after)) break
    belowCount += currentLowerOrder > after.order ? 1 : -1
    belowCount = Math.max(0, Math.min(others.length, belowCount))
  }
  return belowCount + 1
}

const placeMaskGroupAtUpperOrder = (upperId: string, lowerId: string, upperOrder: number) => {
  const upper = state.layers[upperId]
  const lower = state.layers[lowerId]
  if (!upper || !lower) return
  const others = layersByOrder().filter((layer) => layer.id !== upperId && layer.id !== lowerId)
  const belowCount = Math.max(0, Math.min(others.length, upperOrder - 1))
  if (upper.order === belowCount + 1 && lower.order === belowCount) return
  const ordered = [...others.slice(0, belowCount), lower, upper, ...others.slice(belowCount)]
  ordered.forEach((layer, order) => {
    layer.order = order
  })
  layersBridge.reorderLayersList()
}

type MaskDragOrigin = {
  upperId: string
  lowerId: string
  groupStart: number
  groupEnd: number
  upperOrder: number
}

let maskDragOrigin: MaskDragOrigin | null = null

const upperOrderFromDomIndex = (domIndex: number, origin: MaskDragOrigin, count: number) => {
  const span = origin.groupEnd - origin.groupStart
  let groupStart = origin.groupStart
  if (domIndex < origin.groupStart) groupStart = domIndex
  else if (domIndex > origin.groupEnd) groupStart = domIndex - span
  groupStart = Math.max(0, Math.min(count - 2, groupStart))
  return count - 1 - groupStart
}

const onListDragChange = (draggedElement: HTMLElement, domOrder: number, inProgress = true) => {
  const layerId = draggedElement.getAttribute('data-id')
  if (!layerId || !state.layers[layerId] || typeof domOrder !== 'number') {
    if (!inProgress) {
      maskDragOrigin = null
      state.listDragStartIndex = -1
    }
    return
  }
  const count = Object.keys(state.layers).length
  const rawOrder = count - 1 - domOrder

  if (maskDragOrigin) {
    const upperOrder = snapGroupUpperOrder(
      maskDragOrigin.upperId,
      maskDragOrigin.lowerId,
      upperOrderFromDomIndex(domOrder, maskDragOrigin, count)
    )
    placeMaskGroupAtUpperOrder(maskDragOrigin.upperId, maskDragOrigin.lowerId, upperOrder)
    if (!inProgress) {
      const upper = state.layers[maskDragOrigin.upperId]
      if (upper && upper.order !== maskDragOrigin.upperOrder) {
        layersBridge.addLayerHistoryOrderStep(
          maskDragOrigin.upperId,
          upper.order,
          maskDragOrigin.upperOrder,
          maskDragOrigin.lowerId
        )
        if (Coworking.isOpen()) {
          Coworking.sendOrderDragLayer(
            maskDragOrigin.upperId,
            upper.order,
            maskDragOrigin.upperOrder,
            maskDragOrigin.lowerId
          )
        }
      }
      maskDragOrigin = null
      state.listDragStartIndex = -1
    }
    return
  }

  const targetOrder = snapTargetOrder(layerId, rawOrder)
  if (!inProgress) {
    if (targetOrder !== state.listDragStartIndex) {
      layersBridge.addLayerHistoryOrderStep(layerId, targetOrder, state.listDragStartIndex)
      if (Coworking.isOpen()) {
        Coworking.sendOrderDragLayer(layerId, targetOrder, state.listDragStartIndex)
      }
    }
    state.listDragStartIndex = -1
  }

  updateLayerOrger(layerId, targetOrder)
}

const layerRow = (layerId: string) =>
  refs.layersList?.querySelector(`div[data-id="${layerId}"]`) as HTMLElement | null

const startDragLayer = (e: Event, layerListDom: HTMLElement) => {
  closeParams()
  const id = layerListDom.getAttribute('data-id')
  if (!id || !refs.layersList || !state.layers[id]) return
  state.listDragStartIndex = state.layers[id].order
  const group = getAdjacentMaskGroup(id)
  const count = Object.keys(state.layers).length
  const upperRow = group ? layerRow(group.upper.id) : null
  const lowerRow = group ? layerRow(group.lower.id) : null
  maskDragOrigin =
    group && upperRow && lowerRow
      ? {
          upperId: group.upper.id,
          lowerId: group.lower.id,
          groupStart: count - 1 - group.upper.order,
          groupEnd: count - 1 - group.lower.order,
          upperOrder: group.upper.order,
        }
      : null
  const preview = maskDragOrigin && upperRow && lowerRow ? [upperRow, lowerRow] : undefined
  const expanded = Boolean(layerListDom.closest('.editor-layers__container--expanded'))
  const expandedRows = preview ?? [layerListDom]
  if (expanded)
    expandedRows.forEach((row) => row.classList.add('editor-layers__layer-drag-expanded'))
  handleElementsListDragAndDrop(
    e,
    refs.layersList,
    layerListDom,
    onListDragChange,
    'vertical',
    preview
  )
  if (expanded) {
    expandedRows.forEach((row) => row.classList.remove('editor-layers__layer-drag-expanded'))
  }
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
  if (isLayerOccupiedByCoworker(layerId)) return
  if (isYourLayerYours(layerId)) {
    if (layerId === state.currentSelectedLayerId) {
      updateParamsByLayer(layerId)
      toggleParams()
    } else {
      layersBridge.selectLayer(layerId)
      openParamsDocked()
    }
  }
}

const openLayerOptionsAtPointer = async (layerId: string, clientX: number, clientY: number) => {
  if (!isYourLayerYours(layerId) || isLayerOccupiedByCoworker(layerId)) return
  if (layerId !== state.currentSelectedLayerId) {
    await layersBridge.selectLayer(layerId)
  } else {
    updateParamsByLayer(layerId)
  }
  await openParams()
  placeParamsAtPointer(clientX, clientY)
}

export const openSelectedLayerOptionsAtPointer = (clientX: number, clientY: number) => {
  const layerId = state.currentSelectedLayerId
  if (!layerId) return
  void openLayerOptionsAtPointer(layerId, clientX, clientY)
}

export const onLayerContextMenu = async (e: Event) => {
  if (!Params.isDesktop) return
  const mouse = e as MouseEvent
  if (e.type === 'pointerdown' && mouse.button !== 2) return
  mouse.preventDefault()
  const row = findListTargetLayerParent(mouse.target)
  if (!row) return
  const id = row.getAttribute('data-id')
  if (!id) return
  await openLayerOptionsAtPointer(id, mouse.clientX, mouse.clientY)
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
      if (id && isYourLayerYours(id) && !isLayerOccupiedByCoworker(id)) {
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

const syncLayerOwnerRow = (layerId: string) => {
  const row = refs.layersList?.querySelector(`div[data-id="${layerId}"]`)
  if (!row || !state.layers[layerId]) return
  const yours = isYourLayerYours(layerId)
  row.classList.toggle('editor-layers__layer-yours', yours)
  row.classList.toggle('editor-layers__layer-coworker', !yours)
  if (!yours) row.classList.remove('editor-layers__layer-selected')
  row
    .querySelector('.editor-layers__layer-options-button')
    ?.classList.toggle('svg-icon-visible', !yours)
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
  refreshActiveLassoSelection,
  updateLayerOrger,
  placeMaskGroupAtUpperOrder,
  snapTargetOrder,
  snapGroupUpperOrder,
  syncLayerOwnerRow,
  _updateLayerOpacity,
  _updateLayerBlendMode,
  updateLayerListMaskAffordances,
})
