import Params from 'main/Params'
import * as Debug from 'modules/Debug'
import * as ColorPicker from './components/ColorPicker'
import * as Toolbar from './components/Toolbar'
import * as Tools from './components/Tools'
import * as Layers from './components/Layers'
import * as Ruler from './components/Ruler'
import {
  appendLassoPointIfMoved,
  drawMagicWandToleranceCircle,
  renderLassoOverlayFrame,
} from './components/Layers/layerLasso'
import { getEventCoordX, getEventCoordY } from 'utils/domUtils'
import { TOUCH_TYPE_STYLUS } from 'main/constants'
import { updateCurrentTouchData } from './editorUtils'
import {
  beginLassoSelectionMoveDrag,
  clearLassoSelectionOverlay,
  endLassoSelectionMoveDrag,
  paintLassoSelectionMoveDrag,
  showLassoSelectionOverlay,
  updateLassoBarPosition,
  updateLayerContentCoordsAfterDragResize,
  handleResizeLayerContentTouchMove,
  handleDragLayerContentTouchMove,
} from './editorCompositor'
import { round } from 'utils/mathUtils'
import { updatePipette, closePipetteCursor } from './editorLifecycle'
import { EditorRefs } from './EditorView'
import { EditorConfig, EditorState, PointerTouchEvent, ResizeModeState } from './editorTypes'
import { runCoalescedStepTouchMove, updateCurrentTouchType } from './editorStrokeSession'

export type TouchDispatchAction =
  'none' | 'panCanvas' | 'dragLayer' | 'dragZoom' | 'lasso' | 'lassoMove' | 'pipette' | 'step'

const isDesktopCanvasPan = (params: {
  desktopCanvasPanMode?: boolean
  pointerType?: string
}): boolean =>
  Boolean(Params.isDesktop && params.desktopCanvasPanMode && params.pointerType === 'mouse')

export const resolveTouchStartAction = (params: {
  isResizing: boolean
  resizeModeActive: boolean
  lassoModeActive?: boolean
  lassoCapture?: boolean
  lassoHasSelection?: boolean
  lassoMoveMode?: boolean
  desktopCanvasPanMode?: boolean
  pointerType?: string
  currentDeviceHasStylus: boolean
  touchType?: string
  hasZoom: boolean
  toolName?: string
  currentLayerIsActive: boolean
}): TouchDispatchAction => {
  if (params.isResizing) return 'none'
  if (isDesktopCanvasPan(params)) return 'panCanvas'
  if (
    params.currentDeviceHasStylus &&
    params.touchType !== TOUCH_TYPE_STYLUS &&
    params.hasZoom &&
    params.toolName !== 'smudge'
  ) {
    return 'dragZoom'
  }
  if (params.resizeModeActive) return 'dragLayer'
  if (params.lassoModeActive && params.lassoHasSelection && params.lassoMoveMode) return 'lassoMove'
  if (params.toolName === 'magicWand') return 'lasso'
  if (params.lassoCapture !== false && params.lassoModeActive) {
    if (!params.lassoHasSelection) return 'lasso'
    if (params.lassoMoveMode) return 'lassoMove'
  }
  if (params.toolName === 'pipette') return 'pipette'
  if (params.currentLayerIsActive) return 'step'
  return 'none'
}

export const resolveTouchMoveAction = (params: {
  isResizing: boolean
  resizeModeActive: boolean
  lassoModeActive?: boolean
  lassoCapture?: boolean
  lassoHasSelection?: boolean
  lassoMoveMode?: boolean
  desktopCanvasPanMode?: boolean
  pointerType?: string
  isZooming: boolean
  currentDeviceHasStylus: boolean
  touchType?: string
  toolName?: string
  currentLayerIsActive: boolean
}): TouchDispatchAction => {
  if (params.isResizing) return 'none'
  if (isDesktopCanvasPan(params) && params.isZooming) return 'panCanvas'
  if (
    params.isZooming &&
    params.currentDeviceHasStylus &&
    params.touchType !== TOUCH_TYPE_STYLUS &&
    params.toolName !== 'smudge'
  ) {
    return 'dragZoom'
  }
  if (params.resizeModeActive) return 'dragLayer'
  if (params.lassoModeActive && params.lassoHasSelection && params.lassoMoveMode) return 'lassoMove'
  if (params.toolName === 'magicWand') return 'lasso'
  if (params.lassoCapture !== false && params.lassoModeActive) {
    if (!params.lassoHasSelection) return 'lasso'
    if (params.lassoMoveMode) return 'lassoMove'
  }
  if (params.toolName === 'pipette') return 'pipette'
  if (params.currentLayerIsActive) return 'step'
  return 'none'
}

export const resolveTouchEndAction = (params: {
  isResizing: boolean
  resizeModeActive: boolean
  lassoModeActive?: boolean
  lassoCapture?: boolean
  lassoHasSelection?: boolean
  lassoMoveMode?: boolean
  desktopCanvasPanMode?: boolean
  pointerType?: string
  currentDeviceHasStylus: boolean
  isZooming: boolean
  toolName?: string
  currentLayerIsActive: boolean
}): TouchDispatchAction => {
  if (params.isResizing) return 'none'
  if (isDesktopCanvasPan(params) && params.isZooming) return 'panCanvas'
  if (params.currentDeviceHasStylus && params.isZooming) return 'dragZoom'
  if (params.resizeModeActive) return 'dragLayer'
  if (params.lassoModeActive && params.lassoHasSelection && params.lassoMoveMode) return 'lassoMove'
  if (params.toolName === 'magicWand') return 'lasso'
  if (params.lassoCapture !== false && params.lassoModeActive) {
    if (!params.lassoHasSelection) return 'lasso'
    if (params.lassoMoveMode) return 'lassoMove'
  }
  if (params.toolName === 'pipette') return 'pipette'
  if (params.currentLayerIsActive) return 'step'
  return 'none'
}

export interface PointerRouterDeps {
  state: EditorState
  refs: EditorRefs
  config: EditorConfig
  coordsAreInsideLayer: (x: number, y: number) => boolean
  currentCanvasHasZoom: () => boolean
  onGestureStart: (x: number, y: number, scale?: number, rotation?: number) => void
  onGestureChange: (x: number, y: number, scale: number, rotation: number) => void
  onGestureEnd: (x: number, y: number, scale: number, rotation: number) => void
  session: {
    onStepTouchStart: (touchEvent: PointerTouchEvent) => void
    onStepTouchMove: (touchEvent: PointerTouchEvent) => void
    onStepTouchEnd: (e: PointerTouchEvent) => void
    dismissQuickShape?: () => void
  }
}

export const createEditorPointerHandlers = (deps: PointerRouterDeps) => {
  const {
    state,
    refs,
    config,
    coordsAreInsideLayer,
    currentCanvasHasZoom,
    onGestureStart,
    onGestureChange,
    onGestureEnd,
    session,
  } = deps

  const onResizeLayerContentTouchStart = () => {
    state.resizeMode.isResizing = true
  }

  const onDragLayerContentTouchStart = (touchEvent: PointerTouchEvent) => {
    updateCurrentTouchData(state, touchEvent, Params.eventStart)
    state.resizeMode.startDragX = state.resizeMode.x
    state.resizeMode.startDragY = state.resizeMode.y
  }

  const onPanCanvasTouchStart = (touchEvent: PointerTouchEvent) => {
    refs.touchLayer?.classList.add('editor__touch-layer-panning')
    onGestureStart(getEventCoordX(touchEvent, 0), getEventCoordY(touchEvent, 0), 1, 0)
  }

  const onDragZoomTouchStart = (touchEvent: PointerTouchEvent) => {
    if (currentCanvasHasZoom()) {
      onGestureStart(
        getEventCoordX(touchEvent, state.canvas.offset.left),
        getEventCoordY(touchEvent, state.canvas.offset.top),
        1,
        0
      )
    }
  }

  const onPipetteTouchStart = (touchEvent: PointerTouchEvent) => {
    Ruler.hide()
    updateCurrentTouchData(state, touchEvent, Params.eventStart)
    updatePipette(
      state,
      refs,
      coordsAreInsideLayer,
      state.currentTouch.x,
      state.currentTouch.y,
      `${state.currentTouch.eventX}px`,
      `${state.currentTouch.eventY}px`
    )
  }

  const WAND_MAX_TOLERANCE = 255
  let wandSeedX = 0
  let wandSeedY = 0
  let wandSerial = 0
  let wandLastMoveTolerance = -1
  let wandFinishOnReady: PointerTouchEvent | null = null
  let wandOverlayCacheCanvas: HTMLCanvasElement | null = null

  const isMagicWandGesture = () =>
    state.currentToolProps.name === 'magicWand' || Boolean(state.lassoMode.isWand)

  const magicWandDragTolerance = () => {
    const dragPx = Math.hypot(
      state.currentTouch.eventX - state.currentTouch.startDragX,
      state.currentTouch.eventY - state.currentTouch.startDragY
    )
    return Math.min(WAND_MAX_TOLERANCE, Math.max(0, Math.round(dragPx)))
  }

  const syncMagicWandOverlayCache = () => {
    if (!refs.lassoCanvas) return
    const w = refs.lassoCanvas.width
    const h = refs.lassoCanvas.height
    if (w <= 0 || h <= 0) return
    if (!wandOverlayCacheCanvas) {
      wandOverlayCacheCanvas = document.createElement('canvas')
    }
    if (wandOverlayCacheCanvas.width !== w || wandOverlayCacheCanvas.height !== h) {
      wandOverlayCacheCanvas.width = w
      wandOverlayCacheCanvas.height = h
    }
    const points = state.lassoMode.points
    if (points.length >= 2) {
      renderLassoOverlayFrame(wandOverlayCacheCanvas, points, true, state.canvas.scale, 0, {
        rings: state.lassoMode.rings,
      })
    } else {
      wandOverlayCacheCanvas.getContext('2d')?.clearRect(0, 0, w, h)
    }
  }

  const paintMagicWandGesture = (tolerance: number) => {
    if (!refs.lassoCanvas) return
    const ctx = refs.lassoCanvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, refs.lassoCanvas.width, refs.lassoCanvas.height)
    if (wandOverlayCacheCanvas && state.lassoMode.points.length >= 2) {
      ctx.drawImage(wandOverlayCacheCanvas, 0, 0)
    }
    const screenPx = Math.min(WAND_MAX_TOLERANCE, Math.max(0, tolerance))
    const radius = (screenPx * Params.pxScale) / Math.max(0.01, state.canvas.scale || 1)
    drawMagicWandToleranceCircle(refs.lassoCanvas, wandSeedX, wandSeedY, radius, state.canvas.scale)
  }

  const onLassoTouchStart = (touchEvent: PointerTouchEvent) => {
    Tools.closeVersions()
    Layers.closeParams()
    Toolbar.closeParams()
    ColorPicker.closeParams()
    updateCurrentTouchType(state, touchEvent)
    updateCurrentTouchData(state, touchEvent, Params.eventStart, false, false, true)
    const startX = state.currentTouch.rawX ?? state.currentTouch.x
    const startY = state.currentTouch.rawY ?? state.currentTouch.y
    if (isMagicWandGesture()) {
      if (!coordsAreInsideLayer(startX, startY)) return
      wandSeedX = startX
      wandSeedY = startY
      wandLastMoveTolerance = 0
      wandFinishOnReady = null
      const serial = ++wandSerial
      Layers.cancelMagicWandSelection()
      void (async () => {
        const accepted = await Layers.prepareMagicWandStroke()
        if (!accepted || !state.lassoMode.active || serial !== wandSerial) return
        clearLassoSelectionOverlay(state, refs)
        state.lassoMode.isDrawing = true
        state.lassoMode.points = []
        state.lassoMode.rings = []
        const initial = Layers.beginMagicWandSelection(startX, startY, (updated) => {
          if (serial !== wandSerial || !state.lassoMode.isDrawing || !state.lassoMode.active) {
            return
          }
          state.lassoMode.points = updated.points
          state.lassoMode.rings = updated.rings
          syncMagicWandOverlayCache()
          paintMagicWandGesture(magicWandDragTolerance())
        })
        if (!initial) {
          state.lassoMode.isDrawing = false
          return
        }
        if (initial.points.length >= 3) {
          state.lassoMode.points = initial.points
          state.lassoMode.rings = initial.rings
        }
        syncMagicWandOverlayCache()
        const tolerance = magicWandDragTolerance()
        if (tolerance > 0) {
          wandLastMoveTolerance = tolerance
          Layers.updateMagicWandSelectionTolerance(tolerance)
        }
        paintMagicWandGesture(tolerance)
        const finish = wandFinishOnReady
        wandFinishOnReady = null
        if (finish && serial === wandSerial) onLassoTouchEnd(finish)
      })()
      return
    }
    Layers.discardPendingLassoSelection()
    clearLassoSelectionOverlay(state, refs)
    state.lassoMode.isDrawing = true
    state.lassoMode.points = [[startX, startY]]
    state.lassoMode.rings = []
    renderLassoOverlayFrame(refs.lassoCanvas, state.lassoMode.points, false, state.canvas.scale, 0)
  }

  const onLassoTouchMove = (touchEvent: PointerTouchEvent) => {
    if (!state.lassoMode.isDrawing) return
    if (isMagicWandGesture()) {
      updateCurrentTouchData(state, touchEvent, Params.eventMove, false, false, true)
      const tolerance = magicWandDragTolerance()
      if (tolerance === wandLastMoveTolerance) return
      wandLastMoveTolerance = tolerance
      paintMagicWandGesture(tolerance)
      Layers.updateMagicWandSelectionTolerance(tolerance)
      return
    }
    let appended = false
    runCoalescedStepTouchMove(touchEvent, (sampleEvent) => {
      updateCurrentTouchData(state, sampleEvent, Params.eventMove, false, false, true)
      const nextX = state.currentTouch.rawX ?? state.currentTouch.x
      const nextY = state.currentTouch.rawY ?? state.currentTouch.y
      if (appendLassoPointIfMoved(state.lassoMode.points, nextX, nextY)) {
        appended = true
      }
    })
    if (appended) {
      renderLassoOverlayFrame(
        refs.lassoCanvas,
        state.lassoMode.points,
        false,
        state.canvas.scale,
        0
      )
    }
  }

  const onLassoTouchEnd = (touchEvent: PointerTouchEvent) => {
    if (isMagicWandGesture() && !state.lassoMode.isDrawing) {
      wandFinishOnReady = touchEvent
      return
    }
    if (!state.lassoMode.isDrawing) return
    if (isMagicWandGesture()) {
      updateCurrentTouchData(state, touchEvent, Params.eventEnd, false, false, true)
      const tolerance = magicWandDragTolerance()
      state.lassoMode.isDrawing = false
      void Layers.completeMagicWandSelection(tolerance).then((bounds) => {
        if (!state.lassoMode.active) return
        if (bounds) {
          showLassoSelectionOverlay(state, refs, bounds)
        } else {
          clearLassoSelectionOverlay(state, refs)
        }
      })
      return
    }
    updateCurrentTouchData(state, touchEvent, Params.eventEnd, false, false, true)
    const endX = state.currentTouch.rawX ?? state.currentTouch.x
    const endY = state.currentTouch.rawY ?? state.currentTouch.y
    appendLassoPointIfMoved(state.lassoMode.points, endX, endY)
    state.lassoMode.isDrawing = false
    const capturedPoints = [...state.lassoMode.points]
    void Layers.completeLassoSelection(capturedPoints).then((bounds) => {
      if (!state.lassoMode.active) return
      if (bounds) {
        showLassoSelectionOverlay(state, refs, bounds)
      } else {
        clearLassoSelectionOverlay(state, refs)
      }
    })
  }

  let lassoMoveOriginPoints: Array<[number, number]> = []
  let lassoMoveOriginRings: Array<Array<[number, number]>> = []
  let lassoMoveOriginBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }

  const onLassoMoveTouchStart = (touchEvent: PointerTouchEvent) => {
    if (!state.lassoMode.hasSelection || !state.lassoMode.hasPixels) return
    Tools.closeVersions()
    Layers.closeParams()
    Toolbar.closeParams()
    ColorPicker.closeParams()
    refs.lassoBar?.classList.add('editor-lasso__bar--drawing')
    updateCurrentTouchType(state, touchEvent)
    updateCurrentTouchData(state, touchEvent, Params.eventStart, false, false, true)
    state.lassoMode.isDraggingMove = true
    lassoMoveOriginPoints = state.lassoMode.points.map(([px, py]) => [px, py])
    lassoMoveOriginRings = state.lassoMode.rings.map((ring) => ring.map(([px, py]) => [px, py]))
    lassoMoveOriginBounds = {
      minX: state.lassoMode.minX,
      minY: state.lassoMode.minY,
      maxX: state.lassoMode.maxX,
      maxY: state.lassoMode.maxY,
    }
    beginLassoSelectionMoveDrag(refs)
  }

  const onLassoMoveTouchMove = (touchEvent: PointerTouchEvent) => {
    if (!state.lassoMode.isDraggingMove) return
    updateCurrentTouchData(state, touchEvent, Params.eventMove, false, false, true)
    const dx = state.currentTouch.dragX
    const dy = state.currentTouch.dragY
    state.lassoMode.minX = round(lassoMoveOriginBounds.minX + dx, 1)
    state.lassoMode.minY = round(lassoMoveOriginBounds.minY + dy, 1)
    state.lassoMode.maxX = round(lassoMoveOriginBounds.maxX + dx, 1)
    state.lassoMode.maxY = round(lassoMoveOriginBounds.maxY + dy, 1)
    Layers.translateLassoSelectionInPlace(dx, dy)
    paintLassoSelectionMoveDrag(refs, dx, dy)
    updateLassoBarPosition(state, refs)
  }

  const onLassoMoveTouchEnd = (touchEvent: PointerTouchEvent) => {
    refs.lassoBar?.classList.remove('editor-lasso__bar--drawing')
    if (!state.lassoMode.isDraggingMove) return
    state.lassoMode.isDraggingMove = false
    updateCurrentTouchData(state, touchEvent, Params.eventEnd, false, false, true)
    const dx = state.currentTouch.dragX
    const dy = state.currentTouch.dragY
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      state.lassoMode.points = lassoMoveOriginPoints
      state.lassoMode.rings = lassoMoveOriginRings
      state.lassoMode.minX = lassoMoveOriginBounds.minX
      state.lassoMode.minY = lassoMoveOriginBounds.minY
      state.lassoMode.maxX = lassoMoveOriginBounds.maxX
      state.lassoMode.maxY = lassoMoveOriginBounds.maxY
      Layers.translateLassoSelectionInPlace(0, 0)
      endLassoSelectionMoveDrag(state, refs)
      updateLassoBarPosition(state, refs)
      return
    }
    state.lassoMode.points = lassoMoveOriginPoints.map(([px, py]) => [
      round(px + dx, 1),
      round(py + dy, 1),
    ])
    state.lassoMode.rings = lassoMoveOriginRings.map((ring) =>
      ring.map(([px, py]) => [round(px + dx, 1), round(py + dy, 1)])
    )
    void Layers.commitLassoMoveSelectionInPlace(dx, dy)
    endLassoSelectionMoveDrag(state, refs)
  }

  const onTouchStart = (_e: unknown, touchEvent: PointerTouchEvent) => {
    if (Params.isDesktop && touchEvent?.pointerType === 'mouse') {
      state.desktopPointerDown = true
    }
    if (!state.resizeMode.isResizing && touchEvent?.touchType === TOUCH_TYPE_STYLUS) {
      state.currentDeviceHasStylus = true
    }
    const action = resolveTouchStartAction({
      isResizing: state.resizeMode.isResizing,
      resizeModeActive: state.resizeMode.active,
      lassoModeActive: state.lassoMode?.active,
      lassoCapture: state.lassoMode?.captureInput !== false,
      lassoHasSelection: state.lassoMode?.hasSelection,
      lassoMoveMode: state.lassoMode?.isMoveMode,
      desktopCanvasPanMode: state.desktopCanvasPanMode,
      pointerType: touchEvent?.pointerType,
      currentDeviceHasStylus: state.currentDeviceHasStylus,
      touchType: touchEvent?.touchType,
      hasZoom: currentCanvasHasZoom(),
      toolName: state.currentToolProps.name,
      currentLayerIsActive: state.currentLayerIsActive,
    })
    if (action === 'panCanvas') onPanCanvasTouchStart(touchEvent)
    else if (action === 'dragLayer') {
      session.dismissQuickShape?.()
      onDragLayerContentTouchStart(touchEvent)
    } else if (action === 'dragZoom') onDragZoomTouchStart(touchEvent)
    else if (action === 'lasso') {
      session.dismissQuickShape?.()
      onLassoTouchStart(touchEvent)
    } else if (action === 'lassoMove') {
      session.dismissQuickShape?.()
      onLassoMoveTouchStart(touchEvent)
    } else if (action === 'pipette') {
      session.dismissQuickShape?.()
      onPipetteTouchStart(touchEvent)
    } else if (action === 'step') session.onStepTouchStart(touchEvent)
  }

  const onResizeLayerContentTouchMove = (
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
  ) =>
    handleResizeLayerContentTouchMove(
      state,
      refs,
      config,
      newResizeState,
      left,
      top,
      right,
      bottom,
      rotation
    )

  const onDragLayerContentTouchMove = (touchEvent: PointerTouchEvent) =>
    handleDragLayerContentTouchMove(state, refs, touchEvent)

  const onPanCanvasTouchMove = (touchEvent: PointerTouchEvent) => {
    if (state.currentTouch.isZooming) {
      updateCurrentTouchType(state, touchEvent)
      onGestureChange(getEventCoordX(touchEvent, 0), getEventCoordY(touchEvent, 0), 1, 0)
    }
  }

  const onDragZoomTouchMove = (touchEvent: PointerTouchEvent) => {
    if (
      state.currentDeviceHasStylus &&
      touchEvent?.touchType !== TOUCH_TYPE_STYLUS &&
      state.currentTouch.isZooming
    ) {
      updateCurrentTouchType(state, touchEvent)
      onGestureChange(
        getEventCoordX(touchEvent, state.canvas.offset.left),
        getEventCoordY(touchEvent, state.canvas.offset.top),
        1,
        0
      )
    }
  }

  const onPipetteTouchMove = (touchEvent: PointerTouchEvent) => {
    updateCurrentTouchData(state, touchEvent, Params.eventMove)
    updatePipette(
      state,
      refs,
      coordsAreInsideLayer,
      state.currentTouch.x,
      state.currentTouch.y,
      `${state.currentTouch.eventX}px`,
      `${state.currentTouch.eventY}px`
    )
  }

  let moveFrameId = 0
  const queuedMoves: PointerTouchEvent[] = []

  const paintQueuedMoves = () => {
    const batch = queuedMoves.splice(0, queuedMoves.length)
    for (const touchEvent of batch) {
      const action = resolveTouchMoveAction({
        isResizing: state.resizeMode.isResizing,
        resizeModeActive: state.resizeMode.active,
        lassoModeActive: state.lassoMode?.active,
        lassoCapture: state.lassoMode?.captureInput !== false,
        lassoHasSelection: state.lassoMode?.hasSelection,
        lassoMoveMode: state.lassoMode?.isMoveMode,
        desktopCanvasPanMode: state.desktopCanvasPanMode,
        pointerType: touchEvent?.pointerType,
        isZooming: state.currentTouch.isZooming,
        currentDeviceHasStylus: state.currentDeviceHasStylus,
        touchType: touchEvent?.touchType,
        toolName: state.currentToolProps.name,
        currentLayerIsActive: state.currentLayerIsActive,
      })
      if (action === 'panCanvas') onPanCanvasTouchMove(touchEvent)
      else if (action === 'dragLayer') onDragLayerContentTouchMove(touchEvent)
      else if (action === 'dragZoom') onDragZoomTouchMove(touchEvent)
      else if (action === 'lasso') onLassoTouchMove(touchEvent)
      else if (action === 'lassoMove') onLassoMoveTouchMove(touchEvent)
      else if (action === 'pipette') onPipetteTouchMove(touchEvent)
      else if (action === 'step') session.onStepTouchMove(touchEvent)
    }
    if (batch.length) Debug.logFps()
  }

  const flushQueuedMoves = () => {
    moveFrameId = 0
    paintQueuedMoves()
  }

  const onTouchMove = (_e: unknown, touchEvent: PointerTouchEvent) => {
    queuedMoves.push(touchEvent)
    if (moveFrameId) return
    moveFrameId = requestAnimationFrame(flushQueuedMoves)
  }

  const onDragLayerContentTouchEnd = (e: PointerTouchEvent) => {
    updateCurrentTouchData(state, e, Params.eventEnd)
    refs.magnetisedLineX?.classList.add('displayNone')
    refs.magnetisedLineY?.classList.add('displayNone')
    updateLayerContentCoordsAfterDragResize(state, refs)
  }

  const onResizeLayerContentTouchEnd = () => {
    refs.magnetisedLineR?.classList.add('displayNone')
    refs.magnetisedLineY?.classList.add('displayNone')
    refs.magnetisedLineX?.classList.add('displayNone')
    updateLayerContentCoordsAfterDragResize(state, refs)
    Layers.updateMagnetismCoords(undefined, !!state.resizeMode.r)
    state.resizeMode.isResizing = false
  }

  const onPanCanvasTouchEnd = () => {
    refs.touchLayer?.classList.remove('editor__touch-layer-panning')
    onGestureEnd(0, 0, 1, 0)
  }

  const onDragZoomTouchEnd = () => {
    onGestureEnd(0, 0, 1, 0)
  }

  const onPipetteTouchEnd = () => {
    closePipetteCursor(state)
  }

  const onTouchEnd = (e: PointerTouchEvent) => {
    if (Params.isDesktop) {
      state.desktopPointerDown = false
    }
    if (moveFrameId) {
      cancelAnimationFrame(moveFrameId)
      moveFrameId = 0
    }
    paintQueuedMoves()
    const action = resolveTouchEndAction({
      isResizing: state.resizeMode.isResizing,
      resizeModeActive: state.resizeMode.active,
      lassoModeActive: state.lassoMode?.active,
      lassoCapture: state.lassoMode?.captureInput !== false,
      lassoHasSelection: state.lassoMode?.hasSelection,
      lassoMoveMode: state.lassoMode?.isMoveMode,
      desktopCanvasPanMode: state.desktopCanvasPanMode,
      pointerType: e?.pointerType,
      currentDeviceHasStylus: state.currentDeviceHasStylus,
      isZooming: state.currentTouch.isZooming,
      toolName: state.currentToolProps.name,
      currentLayerIsActive: state.currentLayerIsActive,
    })
    if (action === 'panCanvas') onPanCanvasTouchEnd()
    else if (action === 'dragLayer') onDragLayerContentTouchEnd(e)
    else if (action === 'dragZoom') onDragZoomTouchEnd()
    else if (action === 'lasso') onLassoTouchEnd(e)
    else if (action === 'lassoMove') onLassoMoveTouchEnd(e)
    else if (action === 'pipette') onPipetteTouchEnd()
    else if (action === 'step') session.onStepTouchEnd(e)
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onResizeLayerContentTouchStart,
    onResizeLayerContentTouchMove,
    onResizeLayerContentTouchEnd,
  }
}
