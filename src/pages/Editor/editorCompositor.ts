import Params from 'main/Params'
import * as Layers from './components/Layers'
import { isLayerMasked } from './components/Layers/layerMask'
import {
  invalidateLassoOverlayRenderCache,
  renderLassoOverlayFrame,
} from './components/Layers/layerLasso'
import * as Toolbar from './components/Toolbar'
import * as Tools from './components/Tools'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { round, getAverage, roundAngleForSteps, getNumberInBetween } from 'utils/mathUtils'
import { setImageShapeIfNeeded, ExtendedCanvasContext } from 'utils/canvasUtils'
import {
  updateCurrentTouchData,
  findValueWithMagnetism,
  applyRationResizeMagnetism,
} from './editorUtils'
import { EditorRefs } from './EditorView'
import {
  applyFloatingBarScreenPosition,
  clearFloatingBarManualPosition,
  tryApplyFloatingBarManualPosition,
} from './floatingFeatureBarLayout'
import {
  CurrentToolProps,
  EditorCanvasState,
  EditorState,
  PointerTouchEvent,
  ResizeModeState,
  ResizeFramePayload,
  TransformKind,
} from './editorTypes'
import { buildWarpDenseMesh, QuadCorners, WarpMesh } from 'utils/imageWarp'
import {
  createSessionMeshFromAffine,
  getTransformBounds,
  isAffineTransformKind,
  quadFromAffine,
} from './resizeTransformSession'
import { QuickShapeBounds, QuickShapeVariant } from './editorQuickShape'
import { initPipetteCursor } from './editorLifecycle'

let resizeRafId: number | null = null

export type { ResizeFramePayload }

let pendingResizeFrame: {
  madeChanges: boolean
  frame: ResizeFramePayload
} | null = null

export const changePaper = (refs: EditorRefs, paper: string) => {
  if (!refs.canvasContainer) return
  const existingPaper = [...refs.canvasContainer.classList].find((e) => e.indexOf('paper') >= 0)
  if (existingPaper) {
    refs.canvasContainer.classList.remove(existingPaper)
  }
  refs.canvasContainer.classList.add(`paper-${paper}`)
}

export const appendLayer = (refs: EditorRefs, layerCanvas: HTMLCanvasElement) => {
  layerCanvas.classList.add('editor__layer-canvas')
  refs.canvasContainer?.appendChild(layerCanvas)
}

const syncToolImageShapes = (state: EditorState, refs: EditorRefs) => {
  if (state.currentToolProps?.frameImageFile && state.currentToolProps.frameImageName) {
    if (refs.layerContext) {
      setImageShapeIfNeeded(
        refs.layerContext,
        state.currentToolProps.frameImageFile as HTMLImageElement,
        state.currentToolProps.frameImageName,
        state.currentToolProps.color || ''
      )
    }
    if (refs.contextForLine) {
      setImageShapeIfNeeded(
        refs.contextForLine,
        state.currentToolProps.frameImageFile as HTMLImageElement,
        state.currentToolProps.frameImageName,
        state.currentToolProps.color || ''
      )
    }
  }
}

export const setLayerContext = (
  state: EditorState,
  refs: EditorRefs,
  layerContext: ExtendedCanvasContext
) => {
  refs.layerContext = layerContext
  syncToolImageShapes(state, refs)
}

export const applyToolSelection = (
  state: EditorState,
  initialCanvas: EditorCanvasState,
  refs: EditorRefs,
  coordsAreInsideLayer: (x: number, y: number) => boolean,
  tool: Partial<CurrentToolProps>
) => {
  if (state.lassoMode?.isMoveMode) {
    state.lassoMode.isMoveMode = false
    state.lassoMode.isDraggingMove = false
    refs.lassoMoveButton?.classList.remove('selected')
  }
  if (tool.name === 'pipette') {
    initPipetteCursor(state, initialCanvas, refs, coordsAreInsideLayer)
  }
  if (tool.name === 'magicWand') {
    Layers.syncMagicWandTool(true)
  } else if (tool.name) {
    Layers.syncMagicWandTool(false)
  }
  state.currentToolGCO = tool.globalCompositeOperation
  state.currentToolProps = {
    ...state.currentToolProps,
    ...tool,
    globalCompositeOperation: tool.globalCompositeOperation || state.currentLayerGCO,
  }
  syncToolImageShapes(state, refs)
  Toolbar.setTool(state.currentToolProps)
}

export const applyToolColorSelection = (
  state: EditorState,
  refs: EditorRefs,
  color: string | false,
  randomColor: boolean
) => {
  state.currentToolProps.color = color || ''
  state.currentToolProps.randomColor = randomColor
  if (state.currentToolProps.color) {
    syncToolImageShapes(state, refs)
  }
  if (state.currentToolProps.globalCompositeOperation === 'destination-out') {
    Tools.selectLastUsedTool()
  }
  Toolbar.setTool(state.currentToolProps)
}

export const updateEditorLayer = (
  state: EditorState,
  refs: EditorRefs,
  layerZIndex: number,
  opacity: number,
  globalCompositeOperation: GlobalCompositeOperation,
  active: boolean
) => {
  if (!refs.canvasForLine) return
  refs.canvasForLine.style.zIndex = String(layerZIndex + 1)
  refs.canvasForLine.style.opacity = String(opacity)
  refs.canvasForLine.style.mixBlendMode = 'normal'
  state.currentLayerGCO = globalCompositeOperation
  state.currentToolProps.globalCompositeOperation = state.currentToolGCO || globalCompositeOperation
  state.currentLayerIsActive = active
  refs.canvasForLine.classList.toggle('displayNone', !active || isLayerMasked())
}

const cancelPendingResizeRaf = () => {
  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId)
    resizeRafId = null
  }
  pendingResizeFrame = null
}

let lassoAntsRafId: number | null = null
let lassoDashOffset = 0
let lassoMoveDragSnapshot: HTMLCanvasElement | null = null

export const stopLassoMarchingAnts = () => {
  if (lassoAntsRafId !== null) {
    cancelAnimationFrame(lassoAntsRafId)
    lassoAntsRafId = null
  }
}

const startLassoMarchingAnts = (state: EditorState, refs: EditorRefs) => {
  stopLassoMarchingAnts()
  const step = () => {
    if (
      !state.lassoMode?.active ||
      !state.lassoMode.hasSelection ||
      state.lassoMode.isDraggingMove ||
      !refs.lassoCanvas
    ) {
      lassoAntsRafId = null
      return
    }
    lassoDashOffset = (lassoDashOffset + 0.35) % 11
    renderLassoOverlayFrame(
      refs.lassoCanvas,
      state.lassoMode.points,
      true,
      state.canvas.scale,
      lassoDashOffset,
      {
        inverted: state.lassoMode.inverted,
        rings: state.lassoMode.rings,
      }
    )
    lassoAntsRafId = requestAnimationFrame(step)
  }
  lassoAntsRafId = requestAnimationFrame(step)
}

export const updateLassoBarPosition = (state: EditorState, refs: EditorRefs) => {
  if (!refs.lassoBar || !state.lassoMode?.active || !state.lassoMode.hasSelection) return
  if (tryApplyFloatingBarManualPosition('lasso', refs.lassoBar)) return
  const canCreateNewLayer = Layers.canCreateLayerFromLasso()
  const hasPixels = Boolean(state.lassoMode.hasPixels)
  if (!hasPixels && state.lassoMode.isMoveMode) {
    state.lassoMode.isMoveMode = false
    state.lassoMode.isDraggingMove = false
  }
  refs.lassoInvertButton?.classList.toggle('selected', Boolean(state.lassoMode.inverted))
  refs.lassoMoveButton?.classList.toggle('disabled', !hasPixels)
  refs.lassoMoveButton?.classList.toggle(
    'selected',
    Boolean(hasPixels && state.lassoMode.isMoveMode)
  )
  refs.lassoTransformButton?.classList.toggle('disabled', !hasPixels)
  refs.lassoClearButton?.classList.toggle('disabled', !hasPixels)
  refs.lassoCutButton?.classList.toggle('disabled', !hasPixels || !canCreateNewLayer)
  refs.lassoCopyButton?.classList.toggle('disabled', !hasPixels || !canCreateNewLayer)

  if (Params.isPhone) {
    refs.lassoBar.style.left = '50%'
    refs.lassoBar.style.top = ''
    return
  }

  const originRect = refs.canvasOrigin?.getBoundingClientRect()
  if (!originRect) return

  const rad = ((state.canvas.rotation || 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const scale = state.canvas.scale || 1

  const corners: Array<[number, number]> = [
    [state.lassoMode.minX / Params.pxScale, state.lassoMode.minY / Params.pxScale],
    [state.lassoMode.maxX / Params.pxScale, state.lassoMode.minY / Params.pxScale],
    [state.lassoMode.minX / Params.pxScale, state.lassoMode.maxY / Params.pxScale],
    [state.lassoMode.maxX / Params.pxScale, state.lassoMode.maxY / Params.pxScale],
  ]

  let screenMinX = Infinity
  let screenMaxX = -Infinity
  let screenMinY = Infinity
  let screenMaxY = -Infinity

  for (const [lx, ly] of corners) {
    const sx = originRect.left + (lx * cos - ly * sin) * scale
    const sy = originRect.top + (lx * sin + ly * cos) * scale
    if (sx < screenMinX) screenMinX = sx
    if (sx > screenMaxX) screenMaxX = sx
    if (sy < screenMinY) screenMinY = sy
    if (sy > screenMaxY) screenMaxY = sy
  }

  const barRect = refs.lassoBar.getBoundingClientRect()
  const barW = barRect.width || 440
  const barH = barRect.height || 46

  const minLeft = state.canvas.offset.left + barW / 2 + 10
  const maxLeft = Math.max(minLeft, Params.width - state.canvas.offset.right - barW / 2 - 10)
  const minTop = state.canvas.offset.top + 10
  const maxTop = Math.max(minTop, Params.height - state.canvas.offset.bottom - barH - 10)

  const targetLeft = getNumberInBetween(minLeft, maxLeft, (screenMinX + screenMaxX) / 2, 0)
  let targetTop = screenMaxY + 14
  if (targetTop > maxTop) {
    targetTop = screenMinY - barH - 14
  }
  targetTop = getNumberInBetween(minTop, maxTop, targetTop, 0)

  applyFloatingBarScreenPosition(refs.lassoBar, targetLeft, targetTop)
}

export const beginLassoSelectionMoveDrag = (refs: EditorRefs) => {
  stopLassoMarchingAnts()
  if (!refs.lassoCanvas?.width || !refs.lassoCanvas.height) return
  lassoMoveDragSnapshot = document.createElement('canvas')
  lassoMoveDragSnapshot.width = refs.lassoCanvas.width
  lassoMoveDragSnapshot.height = refs.lassoCanvas.height
  lassoMoveDragSnapshot.getContext('2d')?.drawImage(refs.lassoCanvas, 0, 0)
}

export const paintLassoSelectionMoveDrag = (refs: EditorRefs, dx: number, dy: number) => {
  if (!lassoMoveDragSnapshot || !refs.lassoCanvas) return
  const ctx = refs.lassoCanvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, refs.lassoCanvas.width, refs.lassoCanvas.height)
  ctx.drawImage(lassoMoveDragSnapshot, dx, dy)
}

export const endLassoSelectionMoveDrag = (state: EditorState, refs: EditorRefs) => {
  lassoMoveDragSnapshot = null
  invalidateLassoOverlayRenderCache()
  if (!state.lassoMode?.hasSelection || !refs.lassoCanvas) return
  renderLassoOverlayFrame(
    refs.lassoCanvas,
    state.lassoMode.points,
    true,
    state.canvas.scale,
    lassoDashOffset,
    {
      inverted: state.lassoMode.inverted,
      rings: state.lassoMode.rings,
    }
  )
  startLassoMarchingAnts(state, refs)
}

export const clearLassoSelectionOverlay = (state: EditorState, refs: EditorRefs) => {
  Layers.dismissSelectionFilters()
  stopLassoMarchingAnts()
  lassoMoveDragSnapshot = null
  invalidateLassoOverlayRenderCache()
  if (state.lassoMode) {
    state.lassoMode.isDrawing = false
    state.lassoMode.hasSelection = false
    state.lassoMode.hasPixels = false
    state.lassoMode.isMoveMode = false
    state.lassoMode.isDraggingMove = false
    state.lassoMode.inverted = false
    state.lassoMode.points = []
    state.lassoMode.rings = []
    state.lassoMode.minX = -1
    state.lassoMode.minY = -1
    state.lassoMode.maxX = -1
    state.lassoMode.maxY = -1
  }
  if (refs.lassoCanvas) {
    const ctx = refs.lassoCanvas.getContext('2d')
    ctx?.clearRect(0, 0, refs.lassoCanvas.width, refs.lassoCanvas.height)
  }
  refs.lassoMoveButton?.classList.remove('selected')
  refs.lassoBar?.classList.remove('editor-lasso__bar--drawing')
  refs.lassoBar?.classList.add('displayNone')
  clearFloatingBarManualPosition('lasso')
}

export const setLassoModeIsWand = (state: EditorState, isWand: boolean) => {
  if (state.lassoMode) {
    state.lassoMode.isWand = isWand
  }
}

export const setLassoInputCapture = (state: EditorState, capture: boolean) => {
  if (state.lassoMode) {
    state.lassoMode.captureInput = capture
  }
}

export const setLassoModeActive = (
  state: EditorState,
  refs: EditorRefs,
  active: boolean,
  isWand = false
) => {
  clearLassoSelectionOverlay(state, refs)
  if (state.lassoMode) {
    state.lassoMode.active = active
    state.lassoMode.isWand = active ? isWand : false
    state.lassoMode.captureInput = active
  }
  refs.lassoCanvas?.classList.toggle('displayNone', !active)
}

export const showLassoSelectionOverlay = (
  state: EditorState,
  refs: EditorRefs,
  bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
    hasPixels?: boolean
    inverted?: boolean
    points?: Array<[number, number]>
    rings?: Array<Array<[number, number]>>
  }
) => {
  state.lassoMode.isDrawing = false
  state.lassoMode.isDraggingMove = false
  state.lassoMode.hasSelection = true
  state.lassoMode.hasPixels = bounds.hasPixels ?? true
  if (!state.lassoMode.hasPixels) {
    state.lassoMode.isMoveMode = false
  }
  if (typeof bounds.inverted === 'boolean') {
    state.lassoMode.inverted = bounds.inverted
  }
  if (bounds.points) {
    state.lassoMode.points = bounds.points
  }
  if (bounds.rings) {
    state.lassoMode.rings = bounds.rings
  }
  state.lassoMode.minX = bounds.minX
  state.lassoMode.minY = bounds.minY
  state.lassoMode.maxX = bounds.maxX
  state.lassoMode.maxY = bounds.maxY
  refs.lassoBar?.classList.remove('displayNone')
  invalidateLassoOverlayRenderCache()
  updateLassoBarPosition(state, refs)
  startLassoMarchingAnts(state, refs)
}

export const updateQuickShapeBarPosition = (state: EditorState, refs: EditorRefs) => {
  if (!refs.quickShapeBar || !state.quickShapeMode?.active) return
  if (tryApplyFloatingBarManualPosition('quickShape', refs.quickShapeBar)) return

  if (Params.isPhone) {
    refs.quickShapeBar.style.left = '50%'
    refs.quickShapeBar.style.top = ''
    return
  }

  const originRect = refs.canvasOrigin?.getBoundingClientRect()
  if (!originRect) return

  const rad = ((state.canvas.rotation || 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const scale = state.canvas.scale || 1

  const corners: Array<[number, number]> = [
    [state.quickShapeMode.minX / Params.pxScale, state.quickShapeMode.minY / Params.pxScale],
    [state.quickShapeMode.maxX / Params.pxScale, state.quickShapeMode.minY / Params.pxScale],
    [state.quickShapeMode.minX / Params.pxScale, state.quickShapeMode.maxY / Params.pxScale],
    [state.quickShapeMode.maxX / Params.pxScale, state.quickShapeMode.maxY / Params.pxScale],
  ]

  let screenMinX = Infinity
  let screenMaxX = -Infinity
  let screenMinY = Infinity
  let screenMaxY = -Infinity

  for (const [lx, ly] of corners) {
    const sx = originRect.left + (lx * cos - ly * sin) * scale
    const sy = originRect.top + (lx * sin + ly * cos) * scale
    if (sx < screenMinX) screenMinX = sx
    if (sx > screenMaxX) screenMaxX = sx
    if (sy < screenMinY) screenMinY = sy
    if (sy > screenMaxY) screenMaxY = sy
  }

  const barRect = refs.quickShapeBar.getBoundingClientRect()
  const barW = barRect.width || 280
  const barH = barRect.height || 46

  const minLeft = state.canvas.offset.left + barW / 2 + 10
  const maxLeft = Math.max(minLeft, Params.width - state.canvas.offset.right - barW / 2 - 10)
  const minTop = state.canvas.offset.top + 10
  const maxTop = Math.max(minTop, Params.height - state.canvas.offset.bottom - barH - 10)

  const targetLeft = getNumberInBetween(minLeft, maxLeft, (screenMinX + screenMaxX) / 2, 0)
  let targetTop = screenMinY - barH - 14
  if (targetTop < minTop) {
    targetTop = screenMaxY + 14
  }
  targetTop = getNumberInBetween(minTop, maxTop, targetTop, 0)

  applyFloatingBarScreenPosition(refs.quickShapeBar, targetLeft, targetTop)
}

export const showQuickShapeBar = (
  state: EditorState,
  refs: EditorRefs,
  availableVariants: QuickShapeVariant[],
  selectedVariant: QuickShapeVariant,
  bounds: QuickShapeBounds,
  pulse = false
) => {
  if (!state.quickShapeMode) return
  state.quickShapeMode.active = true
  state.quickShapeMode.variant = selectedVariant
  state.quickShapeMode.availableVariants = availableVariants
  state.quickShapeMode.minX = bounds.minX
  state.quickShapeMode.minY = bounds.minY
  state.quickShapeMode.maxX = bounds.maxX
  state.quickShapeMode.maxY = bounds.maxY

  if (refs.quickShapeVariantButtons) {
    for (const [id, btn] of Object.entries(refs.quickShapeVariantButtons)) {
      const visible = availableVariants.includes(id as QuickShapeVariant)
      btn.classList.toggle('displayNone', !visible)
      btn.classList.toggle('selected', id === selectedVariant)
    }
  }

  if (refs.quickShapeBar) {
    refs.quickShapeBar.classList.remove('displayNone')
    if (pulse) {
      refs.quickShapeBar.classList.remove('editor-quickshape__bar--pulse')
      void refs.quickShapeBar.offsetWidth
      refs.quickShapeBar.classList.add('editor-quickshape__bar--pulse')
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(10)
        } catch {
          // Ignore vibration errors on unsupported browsers
        }
      }
    }
    updateQuickShapeBarPosition(state, refs)
  }
}

export const hideQuickShapeBar = (state: EditorState, refs: EditorRefs) => {
  if (state.quickShapeMode) {
    state.quickShapeMode.active = false
    state.quickShapeMode.variant = ''
    state.quickShapeMode.availableVariants = []
    state.quickShapeMode.minX = -1
    state.quickShapeMode.minY = -1
    state.quickShapeMode.maxX = -1
    state.quickShapeMode.maxY = -1
  }
  refs.quickShapeBar?.classList.add('displayNone')
  refs.quickShapeBar?.classList.remove('editor-quickshape__bar--pulse')
  clearFloatingBarManualPosition('quickShape')
}

const updateDragBoxHandlersPosition = (refs: EditorRefs) => {
  if (
    !refs.dragBulletOriginTL ||
    !refs.dragBulletOriginTR ||
    !refs.dragBulletOriginBL ||
    !refs.dragBulletOriginBR ||
    !refs.dragBulletOriginRT ||
    !refs.dragBulletTL ||
    !refs.dragBulletTR ||
    !refs.dragBulletBL ||
    !refs.dragBulletBR ||
    !refs.dragBulletRT ||
    !refs.dragBulletT ||
    !refs.dragBulletR ||
    !refs.dragBulletB ||
    !refs.dragBulletL
  ) {
    return
  }
  const tlRect = refs.dragBulletOriginTL.getBoundingClientRect()
  const trRect = refs.dragBulletOriginTR.getBoundingClientRect()
  const blRect = refs.dragBulletOriginBL.getBoundingClientRect()
  const brRect = refs.dragBulletOriginBR.getBoundingClientRect()
  const rtRect = refs.dragBulletOriginRT.getBoundingClientRect()

  refs.dragBulletTL.style.cssText = `left: ${round(tlRect.left, 0)}px; top: ${round(tlRect.top, 0)}px`
  refs.dragBulletTR.style.cssText = `left: ${round(trRect.left, 0)}px; top: ${round(trRect.top, 0)}px`
  refs.dragBulletBL.style.cssText = `left: ${round(blRect.left, 0)}px; top: ${round(blRect.top, 0)}px`
  refs.dragBulletBR.style.cssText = `left: ${round(brRect.left, 0)}px; top: ${round(brRect.top, 0)}px`
  refs.dragBulletRT.style.cssText = `left: ${round(rtRect.left, 0)}px; top: ${round(rtRect.top, 0)}px`
  refs.dragBulletT.style.cssText = `left: ${getAverage([tlRect.left, trRect.left])}px; top: ${getAverage([tlRect.top, trRect.top])}px`
  refs.dragBulletR.style.cssText = `left: ${getAverage([brRect.left, trRect.left])}px; top: ${getAverage([brRect.top, trRect.top])}px`
  refs.dragBulletB.style.cssText = `left: ${getAverage([blRect.left, brRect.left])}px; top: ${getAverage([blRect.top, brRect.top])}px`
  refs.dragBulletL.style.cssText = `left: ${getAverage([tlRect.left, blRect.left])}px; top: ${getAverage([tlRect.top, blRect.top])}px`
}

const commitDragBoxFrame = (
  state: EditorState,
  refs: EditorRefs,
  madeChanges: boolean,
  frame: ResizeFramePayload
) => {
  if (!refs.dragBox || !state.resizeMode?.active) return
  const { x, y, w, h, r, transformKind, quad, warpMesh } = frame
  const bounds = getTransformBounds(transformKind, x, y, w, h, r, quad, warpMesh)
  const boxW = bounds.maxX - bounds.minX
  const boxH = bounds.maxY - bounds.minY
  const boxCx = (bounds.minX + bounds.maxX) / 2
  const boxCy = (bounds.minY + bounds.maxY) / 2
  const useRotatedBox = isAffineTransformKind(transformKind)
  refs.dragBox.style.cssText = useRotatedBox
    ? `
    left: ${round(x / Params.pxScale, 1)}px;
    top: ${round(y / Params.pxScale, 1)}px;
    width: ${round(w / Params.pxScale, 1)}px;
    height: ${round(h / Params.pxScale, 1)}px;
    transform: translate3d(-50%, -50%, 0px) rotate3d(0, 0, 1, ${r}deg);
  `
    : `
    left: ${round(boxCx / Params.pxScale, 1)}px;
    top: ${round(boxCy / Params.pxScale, 1)}px;
    width: ${round(boxW / Params.pxScale, 1)}px;
    height: ${round(boxH / Params.pxScale, 1)}px;
    transform: translate3d(-50%, -50%, 0px) rotate3d(0, 0, 1, 0deg);
  `
  updateTransformOverlay(state, refs)
  Layers.updateCanvasContent(madeChanges, frame)
}

export const flushPendingResizeFrame = (state: EditorState, refs: EditorRefs) => {
  if (pendingResizeFrame) {
    const pending = pendingResizeFrame
    cancelPendingResizeRaf()
    commitDragBoxFrame(state, refs, pending.madeChanges, pending.frame)
  } else {
    cancelPendingResizeRaf()
  }
}

const buildResizeFramePayload = (state: EditorState): ResizeFramePayload => ({
  x: state.resizeMode.x,
  y: state.resizeMode.y,
  w: state.resizeMode.w,
  h: state.resizeMode.h,
  r: state.resizeMode.r,
  transformKind: state.resizeMode.transformKind,
  quad: state.resizeMode.quad,
  warpMesh: state.resizeMode.warpMesh,
  previewCoarse: state.resizeMode.isResizing,
})

const updateDragBox = (
  state: EditorState,
  refs: EditorRefs,
  madeChanges: boolean,
  partial: Partial<ResizeFramePayload> & Pick<ResizeFramePayload, 'x' | 'y' | 'w' | 'h' | 'r'>
) => {
  if (!refs.dragBox) return
  state.resizeMode = {
    ...state.resizeMode,
    ...partial,
  }
  const frame = buildResizeFramePayload(state)
  if (!madeChanges) {
    cancelPendingResizeRaf()
    commitDragBoxFrame(state, refs, false, frame)
    return
  }
  pendingResizeFrame = { madeChanges, frame }
  if (resizeRafId === null) {
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = null
      const pending = pendingResizeFrame
      pendingResizeFrame = null
      if (pending) {
        commitDragBoxFrame(state, refs, pending.madeChanges, pending.frame)
      }
    })
  }
}

export const showDragBox = (
  state: EditorState,
  refs: EditorRefs,
  x: number,
  y: number,
  w: number,
  h: number,
  useMagnetism: boolean
) => {
  state.resizeMode.active = true
  state.resizeMode.useMagnetism = useMagnetism
  state.resizeMode.transformKind = 'resize'
  fadeInElements(
    [
      refs.resizeTransformBar,
      refs.dragBox,
      refs.dragBulletTL,
      refs.dragBulletTR,
      refs.dragBulletBL,
      refs.dragBulletBR,
      refs.dragBulletT,
      refs.dragBulletL,
      refs.dragBulletR,
      refs.dragBulletB,
      refs.dragBulletRT,
    ].filter(Boolean) as HTMLElement[]
  )
  state.resizeMode.quad = quadFromAffine(x, y, w, h, 0)
  state.resizeMode.warpMesh = createSessionMeshFromAffine(x, y, w, h, 0)
  updateDragBox(state, refs, false, { x, y, w, h, r: 0 })
  syncResizeTransformToolbar(state, refs)
  updateResizeBarPosition(state, refs)
}

const getScreenPointFromLayer = (
  state: EditorState,
  refs: EditorRefs,
  lx: number,
  ly: number,
  originRect?: DOMRect
): [number, number] | null => {
  const rect = originRect ?? refs.canvasOrigin?.getBoundingClientRect()
  if (!rect) return null
  const rad = ((state.canvas.rotation || 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const scale = state.canvas.scale || 1
  const sx = rect.left + ((lx / Params.pxScale) * cos - (ly / Params.pxScale) * sin) * scale
  const sy = rect.top + ((lx / Params.pxScale) * sin + (ly / Params.pxScale) * cos) * scale
  return [sx, sy]
}

/** Resize an overlay canvas only when its size actually changes (assigning width clears it). */
const ensureOverlayCanvasSize = (canvas: HTMLCanvasElement) => {
  if (canvas.width !== Params.width) canvas.width = Params.width
  if (canvas.height !== Params.height) canvas.height = Params.height
}

export const updateTransformOverlay = (state: EditorState, refs: EditorRefs) => {
  if (!state.resizeMode.active) return
  const kind = state.resizeMode.transformKind
  const affine = isAffineTransformKind(kind)
  refs.dragBulletT?.classList.toggle('displayNone', !affine)
  refs.dragBulletR?.classList.toggle('displayNone', !affine)
  refs.dragBulletB?.classList.toggle('displayNone', !affine)
  refs.dragBulletL?.classList.toggle('displayNone', !affine)
  refs.dragBulletRT?.classList.toggle('displayNone', !affine)
  const cornerOnly = kind === 'distort' || kind === 'perspective'
  refs.dragBulletTL?.classList.toggle('displayNone', !affine && !cornerOnly)
  refs.dragBulletTR?.classList.toggle('displayNone', !affine && !cornerOnly)
  refs.dragBulletBL?.classList.toggle('displayNone', !affine && !cornerOnly)
  refs.dragBulletBR?.classList.toggle('displayNone', !affine && !cornerOnly)

  refs.resizeWarpBullets?.forEach((el) => el?.classList.toggle('displayNone', kind !== 'warp'))

  if (affine) {
    updateDragBoxHandlersPosition(refs)
    refs.resizeQuadOverlay?.classList.add('displayNone')
    refs.resizeMeshOverlay?.classList.add('displayNone')
    return
  }

  if (kind === 'warp' && state.resizeMode.warpMesh) {
    const originRect = refs.canvasOrigin?.getBoundingClientRect()
    refs.resizeWarpBullets?.forEach((el, index) => {
      if (!el || !originRect) return
      const p = state.resizeMode.warpMesh!.points[index]
      const screen = getScreenPointFromLayer(state, refs, p.x, p.y, originRect)
      if (!screen) return
      el.style.cssText = `left: ${round(screen[0], 0)}px; top: ${round(screen[1], 0)}px`
    })
    drawWarpMeshOverlay(state, refs)
    refs.resizeQuadOverlay?.classList.add('displayNone')
    return
  }

  if ((kind === 'distort' || kind === 'perspective') && state.resizeMode.quad) {
    const quad = state.resizeMode.quad
    const originRect = refs.canvasOrigin?.getBoundingClientRect()
    const mapCorner = (index: number, el: HTMLElement | null) => {
      if (!el || !originRect) return
      const screen = getScreenPointFromLayer(state, refs, quad[index].x, quad[index].y, originRect)
      if (!screen) return
      el.style.cssText = `left: ${round(screen[0], 0)}px; top: ${round(screen[1], 0)}px`
    }
    mapCorner(0, refs.dragBulletTL)
    mapCorner(1, refs.dragBulletTR)
    mapCorner(2, refs.dragBulletBR)
    mapCorner(3, refs.dragBulletBL)
    drawQuadOverlay(state, refs, quad)
    refs.resizeMeshOverlay?.classList.add('displayNone')
  }
}

const drawQuadOverlay = (state: EditorState, refs: EditorRefs, quad: QuadCorners) => {
  const canvas = refs.resizeQuadOverlay
  if (!canvas) return
  canvas.classList.remove('displayNone')
  canvas.style.opacity = '1'
  ensureOverlayCanvasSize(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const originRect = refs.canvasOrigin?.getBoundingClientRect()
  if (!originRect) return
  const pts = quad
    .map((p) => getScreenPointFromLayer(state, refs, p.x, p.y, originRect))
    .filter(Boolean) as Array<[number, number]>
  if (pts.length !== 4) return
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.95)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.closePath()
  ctx.stroke()
}

const drawWarpMeshOverlay = (state: EditorState, refs: EditorRefs) => {
  const canvas = refs.resizeMeshOverlay
  const mesh = state.resizeMode.warpMesh
  if (!canvas || !mesh) return
  canvas.classList.remove('displayNone')
  canvas.style.opacity = '1'
  ensureOverlayCanvasSize(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.85)'
  ctx.lineWidth = 1.25
  const sub = 8
  const dense = buildWarpDenseMesh(mesh, sub)
  const originRect = refs.canvasOrigin?.getBoundingClientRect()
  if (!originRect) return
  const screenPts = dense.points
    .map((p) => getScreenPointFromLayer(state, refs, p.x, p.y, originRect))
    .filter(Boolean) as Array<[number, number]>
  const idx = (i: number, j: number) => j * dense.cols + i
  for (let cj = 0; cj < mesh.rows; cj++) {
    const j = cj * sub
    ctx.beginPath()
    for (let i = 0; i < dense.cols; i++) {
      const pt = screenPts[idx(i, j)]
      if (i === 0) ctx.moveTo(pt[0], pt[1])
      else ctx.lineTo(pt[0], pt[1])
    }
    ctx.stroke()
  }
  for (let ci = 0; ci < mesh.cols; ci++) {
    const i = ci * sub
    ctx.beginPath()
    for (let j = 0; j < dense.rows; j++) {
      const pt = screenPts[idx(i, j)]
      if (j === 0) ctx.moveTo(pt[0], pt[1])
      else ctx.lineTo(pt[0], pt[1])
    }
    ctx.stroke()
  }
}

export const updateResizeBarPosition = (state: EditorState, refs: EditorRefs) => {
  if (!refs.resizeTransformBar || !state.resizeMode.active) return
  if (tryApplyFloatingBarManualPosition('resize', refs.resizeTransformBar)) return
  for (const [kind, btn] of Object.entries(refs.resizeTransformKindButtons || {})) {
    btn?.classList.toggle('selected', state.resizeMode.transformKind === kind)
  }
  if (Params.isPhone) {
    refs.resizeTransformBar.style.left = '50%'
    refs.resizeTransformBar.style.top = ''
    return
  }
  const bounds = getTransformBounds(
    state.resizeMode.transformKind,
    state.resizeMode.x,
    state.resizeMode.y,
    state.resizeMode.w,
    state.resizeMode.h,
    state.resizeMode.r,
    state.resizeMode.quad,
    state.resizeMode.warpMesh
  )
  const originRect = refs.canvasOrigin?.getBoundingClientRect()
  if (!originRect) return
  const rad = ((state.canvas.rotation || 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const scale = state.canvas.scale || 1
  const corners: Array<[number, number]> = [
    [bounds.minX / Params.pxScale, bounds.minY / Params.pxScale],
    [bounds.maxX / Params.pxScale, bounds.minY / Params.pxScale],
    [bounds.minX / Params.pxScale, bounds.maxY / Params.pxScale],
    [bounds.maxX / Params.pxScale, bounds.maxY / Params.pxScale],
  ]
  let screenMinX = Infinity
  let screenMaxX = -Infinity
  let screenMinY = Infinity
  let screenMaxY = -Infinity
  for (const [lx, ly] of corners) {
    const sx = originRect.left + (lx * cos - ly * sin) * scale
    const sy = originRect.top + (lx * sin + ly * cos) * scale
    if (sx < screenMinX) screenMinX = sx
    if (sx > screenMaxX) screenMaxX = sx
    if (sy < screenMinY) screenMinY = sy
    if (sy > screenMaxY) screenMaxY = sy
  }
  const barRect = refs.resizeTransformBar.getBoundingClientRect()
  const barW = barRect.width || 420
  const barH = barRect.height || 46
  const minLeft = state.canvas.offset.left + barW / 2 + 10
  const maxLeft = Math.max(minLeft, Params.width - state.canvas.offset.right - barW / 2 - 10)
  const minTop = state.canvas.offset.top + 10
  const maxTop = Math.max(minTop, Params.height - state.canvas.offset.bottom - barH - 10)
  const targetLeft = getNumberInBetween(minLeft, maxLeft, (screenMinX + screenMaxX) / 2, 0)
  let targetTop = screenMinY - barH - 14
  if (targetTop < minTop) targetTop = screenMaxY + 14
  targetTop = getNumberInBetween(minTop, maxTop, targetTop, 0)
  applyFloatingBarScreenPosition(refs.resizeTransformBar, targetLeft, targetTop)
}

const syncResizeTransformToolbar = (state: EditorState, refs: EditorRefs) => {
  refs.resizeTransformBar?.classList.remove('displayNone')
  updateResizeBarPosition(state, refs)
}

export const applyTransformKindChange = (
  state: EditorState,
  refs: EditorRefs,
  kind: TransformKind
) => {
  if (!state.resizeMode.active || state.resizeMode.transformKind === kind) return
  flushPendingResizeFrame(state, refs)
  const baked = Layers.bakeResizeSessionWorkingPixels()
  if (!baked) return
  let quad: QuadCorners | null = null
  let warpMesh: WarpMesh | null = null
  if (kind === 'distort' || kind === 'perspective') {
    quad = quadFromAffine(baked.x, baked.y, baked.w, baked.h, baked.r)
  } else if (kind === 'warp') {
    warpMesh = createSessionMeshFromAffine(baked.x, baked.y, baked.w, baked.h, baked.r)
  }
  state.resizeMode = {
    ...state.resizeMode,
    transformKind: kind,
    x: baked.x,
    y: baked.y,
    w: baked.w,
    h: baked.h,
    r: baked.r,
    quad,
    warpMesh,
  }
  updateDragBox(state, refs, true, buildResizeFramePayload(state))
  syncResizeTransformToolbar(state, refs)
}

export const handleTransformQuadChange = (
  state: EditorState,
  refs: EditorRefs,
  quad: QuadCorners
) => {
  state.resizeMode.quad = quad
  updateDragBox(state, refs, true, { ...buildResizeFramePayload(state), quad })
}

export const handleTransformMeshChange = (state: EditorState, refs: EditorRefs, mesh: WarpMesh) => {
  state.resizeMode.warpMesh = mesh
  updateDragBox(state, refs, true, { ...buildResizeFramePayload(state), warpMesh: mesh })
}

export const hideDragBox = (state: EditorState, refs: EditorRefs) => {
  flushPendingResizeFrame(state, refs)
  state.resizeMode.active = false
  state.resizeMode.transformKind = 'resize'
  state.resizeMode.quad = null
  state.resizeMode.warpMesh = null
  state.resizeMode.w =
    state.resizeMode.h =
    state.resizeMode.x =
    state.resizeMode.y =
    state.resizeMode.r =
      -1
  refs.resizeQuadOverlay?.getContext('2d')?.clearRect(0, 0, Params.width, Params.height)
  refs.resizeMeshOverlay?.getContext('2d')?.clearRect(0, 0, Params.width, Params.height)
  // Hide overlays/warp bullets synchronously: fadeOutElements commits
  // opacity:0 inline, and these elements are never faded back in — the
  // mesh/quad guides stayed invisible on every activation after the first.
  for (const el of [
    refs.resizeQuadOverlay,
    refs.resizeMeshOverlay,
    ...(refs.resizeWarpBullets || []),
  ]) {
    el?.classList.add('displayNone')
    if (el) el.style.opacity = ''
  }
  fadeOutElements(
    [
      refs.dragBox,
      refs.dragBulletTL,
      refs.dragBulletTR,
      refs.dragBulletBL,
      refs.dragBulletBR,
      refs.dragBulletT,
      refs.dragBulletL,
      refs.dragBulletR,
      refs.dragBulletB,
      refs.dragBulletRT,
      refs.resizeTransformBar,
    ].filter(Boolean) as HTMLElement[]
  )
  clearFloatingBarManualPosition('resize')
}

export const animateDragBoxHandlersPositionToOrigin = (
  refs: EditorRefs,
  duration = 250,
  onStep?: () => void
): Promise<void> => {
  updateDragBoxHandlersPosition(refs)
  onStep?.()
  return new Promise((resolve) => {
    const startTime = performance.now()
    const totalDuration = duration + 50
    const step = (now: number) => {
      updateDragBoxHandlersPosition(refs)
      onStep?.()
      if (now - startTime < totalDuration) {
        requestAnimationFrame(step)
      } else {
        resolve()
      }
    }
    requestAnimationFrame(step)
  })
}

export const updateLayerContentCoordsAfterDragResize = (state: EditorState, refs: EditorRefs) => {
  flushPendingResizeFrame(state, refs)
  const bounds = getTransformBounds(
    state.resizeMode.transformKind,
    state.resizeMode.x,
    state.resizeMode.y,
    state.resizeMode.w,
    state.resizeMode.h,
    state.resizeMode.r,
    state.resizeMode.quad,
    state.resizeMode.warpMesh
  )
  Layers.setLayerCoordsAfterDragResize(
    Math.max(0, round(bounds.minX)),
    Math.max(0, round(bounds.minY)),
    Math.min(state.canvas.width, round(bounds.maxX)),
    Math.min(state.canvas.height, round(bounds.maxY))
  )
}

export const handleResizeLayerContentTouchMove = (
  state: EditorState,
  refs: EditorRefs,
  editorConfig: { resizeRotationStep: number; resizeRotationInterval: number },
  newResizeState: Partial<ResizeModeState> & {
    x: number
    y: number
    w: number
    h: number
    r: number
  },
  left: boolean,
  top: boolean,
  right: boolean,
  bottom: boolean,
  rotation: boolean
) => {
  if (state.resizeMode.useMagnetism) {
    if (rotation) {
      const newR = roundAngleForSteps(
        newResizeState.r,
        editorConfig.resizeRotationStep,
        editorConfig.resizeRotationInterval
      )
      if (Math.abs(newR) % editorConfig.resizeRotationInterval === 0 && refs.magnetisedLineR) {
        refs.magnetisedLineR.classList.remove('displayNone')
        refs.magnetisedLineR.style.cssText = `
          left: ${(newResizeState.x || 0) / Params.pxScale}px;
          top: ${(newResizeState.y || 0) / Params.pxScale}px;
          transform: translate3d(-50%, -50%, 0px) rotate3d(0, 0, 1, ${newR}deg);
        `
      } else {
        refs.magnetisedLineR?.classList.add('displayNone')
      }
      newResizeState.r = newR
    } else {
      const magnetismCoords = Layers.getMagnetismCoords()
      let lineXCoord: number | false
      let lineYCoord: number | false
      ;[newResizeState, lineXCoord, lineYCoord] = applyRationResizeMagnetism(
        newResizeState,
        magnetismCoords,
        left,
        top,
        right,
        bottom
      ) as [typeof newResizeState, number | false, number | false]

      if (refs.magnetisedLineY && refs.magnetisedLineX) {
        refs.magnetisedLineY.style.top = `${Number(lineYCoord || 0) / Params.pxScale}px`
        refs.magnetisedLineX.style.left = `${Number(lineXCoord || 0) / Params.pxScale}px`
        refs.magnetisedLineY.classList.toggle('displayNone', !lineYCoord)
        refs.magnetisedLineX.classList.toggle('displayNone', !lineXCoord)
      }
    }
  }

  updateDragBox(state, refs, true, {
    x: newResizeState.x,
    y: newResizeState.y,
    w: newResizeState.w,
    h: newResizeState.h,
    r: newResizeState.r,
  })
}

export const handleDragLayerContentTouchMove = (
  state: EditorState,
  refs: EditorRefs,
  touchEvent: PointerTouchEvent
) => {
  updateCurrentTouchData(state, touchEvent, Params.eventMove)
  let newX = state.resizeMode.startDragX + state.currentTouch.dragX
  let magnetismLineX: number | false = false
  let newY = state.resizeMode.startDragY + state.currentTouch.dragY
  let magnetismLineY: number | false = false

  if (state.resizeMode.useMagnetism) {
    const magnetismCoords = Layers.getMagnetismCoords()
    ;[newX, magnetismLineX] = findValueWithMagnetism(newX, magnetismCoords.x)
    ;[newY, magnetismLineY] = findValueWithMagnetism(newY, magnetismCoords.y)
  }

  if (refs.magnetisedLineX && refs.magnetisedLineY) {
    refs.magnetisedLineX.style.left = `${(magnetismLineX || 0) / Params.pxScale}px`
    refs.magnetisedLineY.style.top = `${(magnetismLineY || 0) / Params.pxScale}px`
    refs.magnetisedLineX.classList.toggle('displayNone', !magnetismLineX)
    refs.magnetisedLineY.classList.toggle('displayNone', !magnetismLineY)
  }

  const dx = round(newX, 1) - state.resizeMode.x
  const dy = round(newY, 1) - state.resizeMode.y
  const kind = state.resizeMode.transformKind
  if (kind === 'distort' || kind === 'perspective') {
    if (state.resizeMode.quad) {
      const quad = state.resizeMode.quad.map((p) => ({
        x: round(p.x + dx, 1),
        y: round(p.y + dy, 1),
      })) as QuadCorners
      state.resizeMode.x = round(newX, 1)
      state.resizeMode.y = round(newY, 1)
      handleTransformQuadChange(state, refs, quad)
      return
    }
  }
  if (kind === 'warp' && state.resizeMode.warpMesh) {
    const mesh: WarpMesh = {
      ...state.resizeMode.warpMesh,
      points: state.resizeMode.warpMesh.points.map((p) => ({
        x: round(p.x + dx, 1),
        y: round(p.y + dy, 1),
      })),
    }
    state.resizeMode.x = round(newX, 1)
    state.resizeMode.y = round(newY, 1)
    handleTransformMeshChange(state, refs, mesh)
    return
  }
  updateDragBox(state, refs, true, {
    x: round(newX, 1),
    y: round(newY, 1),
    w: state.resizeMode.w,
    h: state.resizeMode.h,
    r: state.resizeMode.r,
  })
}
