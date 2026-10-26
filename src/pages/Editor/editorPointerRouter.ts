import Params from 'main/Params'
import * as Debug from 'modules/Debug'
import * as ColorPicker from './components/ColorPicker'
import * as Toolbar from './components/Toolbar'
import * as Tools from './components/Tools'
import * as Layers from './components/Layers'
import * as Ruler from './components/Ruler'
import { appendLassoPointIfMoved, renderLassoOverlayFrame } from './components/Layers/layerLasso'
import { getEventCoordX, getEventCoordY } from 'utils/domUtils'
import { TOUCH_TYPE_STYLUS } from 'main/constants'
import { updateCurrentTouchData } from './editorUtils'
import {
  clearLassoSelectionOverlay,
  showLassoSelectionOverlay,
  updateLayerContentCoordsAfterDragResize,
  handleResizeLayerContentTouchMove,
  handleDragLayerContentTouchMove,
} from './editorCompositor'
import { updatePipette, closePipetteCursor } from './editorLifecycle'
import { EditorRefs } from './EditorView'
import { EditorConfig, EditorState, PointerTouchEvent, ResizeModeState } from './editorTypes'
import { runCoalescedStepTouchMove, updateCurrentTouchType } from './editorStrokeSession'

export type TouchDispatchAction =
  'none' | 'panCanvas' | 'dragLayer' | 'dragZoom' | 'lasso' | 'pipette' | 'step'

const isDesktopCanvasPan = (params: {
  desktopCanvasPanMode?: boolean
  pointerType?: string
}): boolean =>
  Boolean(Params.isDesktop && params.desktopCanvasPanMode && params.pointerType === 'mouse')

export const resolveTouchStartAction = (params: {
  isResizing: boolean
  resizeModeActive: boolean
  lassoModeActive?: boolean
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
  if (params.resizeModeActive) return 'dragLayer'
  if (params.currentDeviceHasStylus && params.touchType !== TOUCH_TYPE_STYLUS && params.hasZoom) {
    return 'dragZoom'
  }
  if (params.lassoModeActive) return 'lasso'
  if (params.toolName === 'pipette') return 'pipette'
  if (params.currentLayerIsActive) return 'step'
  return 'none'
}

export const resolveTouchMoveAction = (params: {
  isResizing: boolean
  resizeModeActive: boolean
  lassoModeActive?: boolean
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
  if (params.resizeModeActive) return 'dragLayer'
  if (params.isZooming && params.currentDeviceHasStylus && params.touchType !== TOUCH_TYPE_STYLUS) {
    return 'dragZoom'
  }
  if (params.lassoModeActive) return 'lasso'
  if (params.toolName === 'pipette') return 'pipette'
  if (params.currentLayerIsActive) return 'step'
  return 'none'
}

export const resolveTouchEndAction = (params: {
  isResizing: boolean
  resizeModeActive: boolean
  lassoModeActive?: boolean
  desktopCanvasPanMode?: boolean
  pointerType?: string
  currentDeviceHasStylus: boolean
  isZooming: boolean
  toolName?: string
  currentLayerIsActive: boolean
}): TouchDispatchAction => {
  if (params.isResizing) return 'none'
  if (isDesktopCanvasPan(params) && params.isZooming) return 'panCanvas'
  if (params.resizeModeActive) return 'dragLayer'
  if (params.currentDeviceHasStylus && params.isZooming) return 'dragZoom'
  if (params.lassoModeActive) return 'lasso'
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

  const onLassoTouchStart = (touchEvent: PointerTouchEvent) => {
    Tools.closeVersions()
    Layers.closeParams()
    Toolbar.closeParams()
    ColorPicker.closeParams()
    Layers.discardPendingLassoSelection()
    clearLassoSelectionOverlay(state, refs)
    updateCurrentTouchType(state, touchEvent)
    updateCurrentTouchData(state, touchEvent, Params.eventStart, false, false, true)
    const startX = state.currentTouch.rawX ?? state.currentTouch.x
    const startY = state.currentTouch.rawY ?? state.currentTouch.y
    state.lassoMode.isDrawing = true
    state.lassoMode.points = [[startX, startY]]
    renderLassoOverlayFrame(refs.lassoCanvas, state.lassoMode.points, false, state.canvas.scale, 0)
  }

  const onLassoTouchMove = (touchEvent: PointerTouchEvent) => {
    if (!state.lassoMode.isDrawing) return
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
    if (!state.lassoMode.isDrawing) return
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
