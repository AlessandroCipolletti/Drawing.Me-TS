import Params from 'main/Params'
import * as Layers from './components/Layers'
import * as Ruler from './components/Ruler'
import { getEventCoordX, getEventCoordY } from 'utils/domUtils'
import { TOUCH_TYPE_STYLUS } from 'main/constants'
import { updateCurrentTouchData } from './editorUtils'
import {
  updateLayerContentCoordsAfterDragResize,
  handleResizeLayerContentTouchMove,
  handleDragLayerContentTouchMove,
} from './editorCompositor'
import { updatePipette, closePipetteCursor } from './editorLifecycle'
import { EditorRefs } from './EditorView'
import { EditorConfig, EditorState, PointerTouchEvent, ResizeModeState } from './editorTypes'
import { updateCurrentTouchType } from './editorStrokeSession'

export type TouchDispatchAction = 'none' | 'dragLayer' | 'dragZoom' | 'pipette' | 'step'

export const resolveTouchStartAction = (params: {
  isResizing: boolean
  resizeModeActive: boolean
  currentDeviceHasStylus: boolean
  touchType?: string
  hasZoom: boolean
  toolName?: string
  currentLayerIsActive: boolean
}): TouchDispatchAction => {
  if (params.isResizing) return 'none'
  if (params.resizeModeActive) return 'dragLayer'
  if (params.currentDeviceHasStylus && params.touchType !== TOUCH_TYPE_STYLUS && params.hasZoom) {
    return 'dragZoom'
  }
  if (params.toolName === 'pipette') return 'pipette'
  if (params.currentLayerIsActive) return 'step'
  return 'none'
}

export const resolveTouchMoveAction = (params: {
  isResizing: boolean
  resizeModeActive: boolean
  isZooming: boolean
  currentDeviceHasStylus: boolean
  touchType?: string
  toolName?: string
  currentLayerIsActive: boolean
}): TouchDispatchAction => {
  if (params.isResizing) return 'none'
  if (params.resizeModeActive) return 'dragLayer'
  if (params.isZooming && params.currentDeviceHasStylus && params.touchType !== TOUCH_TYPE_STYLUS) {
    return 'dragZoom'
  }
  if (params.toolName === 'pipette') return 'pipette'
  if (params.currentLayerIsActive) return 'step'
  return 'none'
}

export const resolveTouchEndAction = (params: {
  isResizing: boolean
  resizeModeActive: boolean
  currentDeviceHasStylus: boolean
  isZooming: boolean
  toolName?: string
  currentLayerIsActive: boolean
}): TouchDispatchAction => {
  if (params.isResizing) return 'none'
  if (params.resizeModeActive) return 'dragLayer'
  if (params.currentDeviceHasStylus && params.isZooming) return 'dragZoom'
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

  const onTouchStart = (_e: unknown, touchEvent: PointerTouchEvent) => {
    if (!state.resizeMode.isResizing && touchEvent?.touchType === TOUCH_TYPE_STYLUS) {
      state.currentDeviceHasStylus = true
    }
    const action = resolveTouchStartAction({
      isResizing: state.resizeMode.isResizing,
      resizeModeActive: state.resizeMode.active,
      currentDeviceHasStylus: state.currentDeviceHasStylus,
      touchType: touchEvent?.touchType,
      hasZoom: currentCanvasHasZoom(),
      toolName: state.currentToolProps.name,
      currentLayerIsActive: state.currentLayerIsActive,
    })
    if (action === 'dragLayer') onDragLayerContentTouchStart(touchEvent)
    else if (action === 'dragZoom') onDragZoomTouchStart(touchEvent)
    else if (action === 'pipette') onPipetteTouchStart(touchEvent)
    else if (action === 'step') session.onStepTouchStart(touchEvent)
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

  const onTouchMove = (_e: unknown, touchEvent: PointerTouchEvent) => {
    const action = resolveTouchMoveAction({
      isResizing: state.resizeMode.isResizing,
      resizeModeActive: state.resizeMode.active,
      isZooming: state.currentTouch.isZooming,
      currentDeviceHasStylus: state.currentDeviceHasStylus,
      touchType: touchEvent?.touchType,
      toolName: state.currentToolProps.name,
      currentLayerIsActive: state.currentLayerIsActive,
    })
    if (action === 'dragLayer') onDragLayerContentTouchMove(touchEvent)
    else if (action === 'dragZoom') onDragZoomTouchMove(touchEvent)
    else if (action === 'pipette') onPipetteTouchMove(touchEvent)
    else if (action === 'step') session.onStepTouchMove(touchEvent)
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

  const onDragZoomTouchEnd = () => {
    onGestureEnd(0, 0, 1, 0)
  }

  const onPipetteTouchEnd = () => {
    closePipetteCursor(state)
  }

  const onTouchEnd = (e: PointerTouchEvent) => {
    const action = resolveTouchEndAction({
      isResizing: state.resizeMode.isResizing,
      resizeModeActive: state.resizeMode.active,
      currentDeviceHasStylus: state.currentDeviceHasStylus,
      isZooming: state.currentTouch.isZooming,
      toolName: state.currentToolProps.name,
      currentLayerIsActive: state.currentLayerIsActive,
    })
    if (action === 'dragLayer') onDragLayerContentTouchEnd(e)
    else if (action === 'dragZoom') onDragZoomTouchEnd()
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
