import Params from 'main/Params'
import * as Messages from 'modules/Messages'
import * as ColorPicker from './components/ColorPicker'
import * as Layers from './components/Layers'
import * as Tools from './components/Tools'
import { spacing } from 'main/Theme'
import { getEventCoordX, getEventCoordY, getDomRect } from 'utils/domUtils'
import { round, getNumberInBetween, getOriginalCoordsFromScaleRotation } from 'utils/mathUtils'
import { init as initCanvasUtils } from 'utils/canvasUtils'
import { updateEditorZoomGlobalState, initCanvasOffset } from './editorUtils'
import { EditorRefs } from './EditorView'
import { EditorCanvasState, EditorState, PointerTouchEvent } from './editorTypes'

const BASE_MAX_SPEED_FACTOR_LENGTH = 150
const DIFFERENT_SCREEN_SIZES_MESSAGE = 'You and your friend have different screen sizes'
const SAFE_CANVAS_SIDE = 4096

let provenCanvasSide = SAFE_CANVAS_SIDE
let provenCanvasArea = SAFE_CANVAS_SIDE * SAFE_CANVAS_SIDE

const fitCanvasInsideSide = (width: number, height: number, maxSide: number): [number, number] => {
  const longest = Math.max(width, height)
  if (longest <= maxSide) return [round(width, 0), round(height, 0)]
  const fit = maxSide / longest
  return [round(width * fit, 0), round(height * fit, 0)]
}

const browserCanAllocateCanvas = (width: number, height: number): boolean => {
  const side = Math.max(width, height)
  const area = width * height
  if (side <= provenCanvasSide && area <= provenCanvasArea) return true
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = 1
    canvas.height = 1
    return false
  }
  const context = canvas.getContext('2d')
  if (!context) {
    canvas.width = 1
    canvas.height = 1
    return false
  }
  try {
    context.fillRect(0, 0, 1, 1)
    const pixel = context.getImageData(0, 0, 1, 1)
    const usable = pixel.data.length === 4
    if (usable) {
      provenCanvasSide = Math.max(provenCanvasSide, side)
      provenCanvasArea = Math.max(provenCanvasArea, area)
    }
    canvas.width = 1
    canvas.height = 1
    return usable
  } catch {
    canvas.width = 1
    canvas.height = 1
    return false
  }
}

const resolveBackingStoreSize = (
  width: number,
  height: number,
  maxSide: number
): [number, number] => {
  const preferred = fitCanvasInsideSide(width, height, maxSide)
  if (browserCanAllocateCanvas(preferred[0], preferred[1])) return preferred
  return fitCanvasInsideSide(width, height, Math.min(maxSide, SAFE_CANVAS_SIDE))
}

let zoomLabelRafId = 0
let pendingZoomLabelScale = 1

export const isCanvasZoomed = (state: EditorState, initialCanvas: EditorCanvasState): boolean =>
  state.canvas?.scale !== initialCanvas.scale ||
  state.canvas?.rotation !== initialCanvas.rotation ||
  state.canvas?.translateX !== initialCanvas.translateX ||
  state.canvas?.translateY !== initialCanvas.translateY

export const initCanvasCenter = (state: EditorState, refs: EditorRefs) => {
  if (!refs.canvasCenter) return
  const centerRect = refs.canvasCenter.getBoundingClientRect()
  state.canvas.centerCoordX = round(centerRect.left)
  state.canvas.centerCoordY = round(centerRect.top)
}

const updateZoomCss = (
  state: EditorState,
  refs: EditorRefs,
  onUpdateDragBoxHandlers: () => void,
  scale = state.canvas.scale,
  rotation = state.canvas.rotation
) => {
  if (!refs.canvasContainer) return
  pendingZoomLabelScale = scale
  if (!zoomLabelRafId) {
    zoomLabelRafId = requestAnimationFrame(() => {
      zoomLabelRafId = 0
      Messages.update(`${round(pendingZoomLabelScale * 100, 0)}%`)
    })
  }
  refs.canvasContainer.style.transformOrigin = `${state.canvas.transformOriginX}px ${state.canvas.transformOriginY}px`
  refs.canvasContainer.style.transform = `
    scale3d(${scale}, ${scale}, 1)
    rotate3d(0, 0, 1, ${rotation}deg)
    translate3d(${state.canvas.translateX}px, ${state.canvas.translateY}px, 0px)
  `
  document.documentElement.style.setProperty('--canvas-scale', String(scale))
  updateEditorZoomGlobalState(scale)
  onUpdateDragBoxHandlers()
}

export const handleGestureStart = (state: EditorState, refs: EditorRefs, x: number, y: number) => {
  ColorPicker.closeParams()
  Tools.closeVersions()
  Layers.closeParams()
  if (state.lassoMode?.isDrawing) {
    state.lassoMode.isDrawing = false
    state.lassoMode.points = []
    state.lassoMode.rings = []
    Layers.cancelMagicWandSelection()
    refs.lassoCanvas
      ?.getContext('2d')
      ?.clearRect(0, 0, refs.lassoCanvas.width, refs.lassoCanvas.height)
  }
  x = round(x - state.canvas.offset.left, 1)
  y = round(y - state.canvas.offset.top, 1)
  state.currentTouch.isZooming = true
  const [X, Y] = getOriginalCoordsFromScaleRotation(
    x,
    y,
    state.canvas.originCoordX,
    state.canvas.originCoordY,
    state.canvas.scale,
    state.canvas.rotation
  )
  if (refs.canvasContainer) refs.canvasContainer.style.transition = 'none'
  state.canvas.translateX = round(x - X, 1)
  state.canvas.translateY = round(y - Y, 1)
  state.canvas.translateStartX = state.canvas.translateX
  state.canvas.translateStartY = state.canvas.translateY
  state.canvas.dragStartX = x
  state.canvas.dragStartY = y
  if (state.pipette.isVisible) {
    ColorPicker.deselectPipette(true, true, true)
  }
}

export const handleGestureChange = (
  state: EditorState,
  refs: EditorRefs,
  editorConfig: { maxScale: number; minScale: number },
  onUpdateDragBoxHandlers: () => void,
  x: number,
  y: number,
  scale: number,
  rotation: number
) => {
  scale = getNumberInBetween(
    round(state.canvas.scale * scale, 4),
    editorConfig.maxScale,
    editorConfig.minScale
  )
  rotation = round(state.canvas.rotation + rotation, 4)
  x = round(x - state.canvas.offset.left, 1)
  y = round(y - state.canvas.offset.top, 1)
  state.currentTouch.zoomDragChanged = true

  const dx = x - state.canvas.dragStartX
  const dy = y - state.canvas.dragStartY

  state.canvas.translateX = round((state.canvas.translateStartX || 0) + dx, 1)
  state.canvas.translateY = round((state.canvas.translateStartY || 0) + dy, 1)
  state.canvas.transformOriginX = x
  state.canvas.transformOriginY = y

  updateZoomCss(state, refs, onUpdateDragBoxHandlers, scale, rotation)
}

export const handleGestureEnd = (
  state: EditorState,
  initialCanvas: EditorCanvasState,
  refs: EditorRefs,
  editorConfig: { maxScale: number; minScale: number },
  onUpdateDragBoxHandlers: () => void,
  animateDragBoxHandlers: (duration: number) => Promise<void>,
  scale: number,
  rotation: number
) => {
  state.currentTouch.isZooming = false
  if (!state.currentTouch.zoomDragChanged || !refs.canvasCenter || !refs.canvasOrigin) {
    return
  }
  state.currentTouch.zoomDragChanged = false
  scale = getNumberInBetween(
    round(state.canvas.scale * scale, 4),
    editorConfig.maxScale,
    editorConfig.minScale
  )
  rotation = round((state.canvas.rotation + rotation) % 360, 4)

  const centerRect = refs.canvasCenter.getBoundingClientRect()
  const centerShiftX = round(Math.abs(state.canvas.centerCoordX - centerRect.left))
  const centerShiftY = round(Math.abs(state.canvas.centerCoordY - centerRect.top))

  if (
    !state.desktopCanvasPanMode &&
    Math.abs(round(scale - state.canvas.initialScale, 2)) < 0.1 &&
    (Math.abs(rotation) <= 5 || Math.abs(Math.abs(rotation) - 360) <= 5) &&
    centerShiftX < 150 &&
    centerShiftY < 150
  ) {
    if (refs.canvasContainer) {
      refs.canvasContainer.style.transition = 'transform 0.25s, transform-origin 0.25s'
    }
    scale = state.canvas.initialScale
    rotation = 0
    state.canvas = {
      ...initialCanvas,
      scale,
      rotation,
      offset: state.canvas.offset,
      width: state.canvas.width,
      height: state.canvas.height,
      centerCoordX: state.canvas.centerCoordX,
      centerCoordY: state.canvas.centerCoordY,
    }
    animateDragBoxHandlers(250)
  } else {
    const originRect = refs.canvasOrigin.getBoundingClientRect()
    state.canvas = {
      ...state.canvas,
      scale,
      rotation,
      dragStartX: 0,
      dragStartY: 0,
      originCoordX: round(originRect.left - state.canvas.offset.left, 1),
      originCoordY: round(originRect.top - state.canvas.offset.top, 1),
    }
  }
  updateZoomCss(state, refs, onUpdateDragBoxHandlers)
  updateEditorZoomGlobalState(scale)
}

const getCanvasContainerPxSizes = (
  state: EditorState,
  screenWidth = Params.width,
  screenHeight = Params.height
): [number, number] => {
  initCanvasOffset(state)
  return [
    round((screenWidth - state.canvas.offset.left - state.canvas.offset.right) * Params.pxScale, 0),
    round(
      (screenHeight - state.canvas.offset.top - state.canvas.offset.bottom) * Params.pxScale,
      0
    ),
  ]
}

export const getCanvasPxSizesForEditor = (
  state: EditorState,
  editorConfig: { maxCanvasSize: number; canvasScaleWithGoodPerformance: number },
  withCoworking = false
): [number, number] => {
  if (withCoworking) {
    const [width, height] = getCanvasContainerPxSizes(state)
    return [width + spacing.EDITOR_TOOLS_WIDTH, height]
  }
  const [containerWidth, containerHeight] = getCanvasContainerPxSizes(state)
  if (!Params.deviceHasGoodPerformance) {
    return resolveBackingStoreSize(containerWidth, containerHeight, editorConfig.maxCanvasSize)
  }
  return resolveBackingStoreSize(
    round(containerWidth * editorConfig.canvasScaleWithGoodPerformance, 0),
    round(containerHeight * editorConfig.canvasScaleWithGoodPerformance, 0),
    editorConfig.maxCanvasSize
  )
}

export const initCanvasDimension = (
  state: EditorState,
  refs: EditorRefs,
  editorConfig: {
    maxScale: number
    minScale: number
    maxCanvasSize: number
    canvasScaleWithGoodPerformance: number
  },
  onUpdateDragBoxHandlers: () => void,
  canvasWidth?: number,
  canvasHeight?: number,
  withCoworking = false
) => {
  if (!canvasWidth || !canvasHeight) {
    ;[canvasWidth, canvasHeight] = getCanvasPxSizesForEditor(state, editorConfig, withCoworking)
  }
  if (refs.canvasForLine) {
    refs.canvasForLine.width = state.canvas.width = canvasWidth
    refs.canvasForLine.height = state.canvas.height = canvasHeight
  }
  if (refs.lassoCanvas) {
    refs.lassoCanvas.width = canvasWidth
    refs.lassoCanvas.height = canvasHeight
  }
  if (refs.guidesOverlay) {
    refs.guidesOverlay.width = canvasWidth
    refs.guidesOverlay.height = canvasHeight
  }

  initCanvasUtils()

  if (withCoworking) {
    const [normalCanvasWidth, normalCanvasHeight] = getCanvasPxSizesForEditor(
      state,
      editorConfig,
      true
    )
    if (canvasWidth !== normalCanvasWidth || canvasHeight !== normalCanvasHeight) {
      Messages.info(DIFFERENT_SCREEN_SIZES_MESSAGE)
    }
  }

  const [containerWidth, containerHeight] = getCanvasContainerPxSizes(state)
  state.canvas.initialScale = state.canvas.scale = getNumberInBetween(
    editorConfig.maxScale,
    editorConfig.minScale,
    round(Math.min(containerWidth / canvasWidth, containerHeight / canvasHeight), 4)
  )

  if (refs.canvasContainer) {
    refs.canvasContainer.style.cssText = `
      top: ${state.canvas.offset.top}px;
      left: ${state.canvas.offset.left}px;
      width: ${canvasWidth / Params.pxScale}px;
      height: ${canvasHeight / Params.pxScale}px;
    `
  }
  updateZoomCss(state, refs, onUpdateDragBoxHandlers)
}

export const handleViewportRotate = (
  state: EditorState,
  initialCanvas: EditorCanvasState,
  refs: EditorRefs,
  editorConfig: {
    maxSpeedFactorLength: number
    maxScale: number
    minScale: number
  },
  onUpdateDragBoxHandlers: () => void
) => {
  editorConfig.maxSpeedFactorLength = round(
    BASE_MAX_SPEED_FACTOR_LENGTH / (Params.viewportScale || 1),
    0
  )
  if (!state?.canvas) return
  const [containerWidth, containerHeight] = getCanvasContainerPxSizes(state)
  if (state.canvas.width && state.canvas.height) {
    const newInitialScale = getNumberInBetween(
      editorConfig.maxScale,
      editorConfig.minScale,
      round(Math.min(containerWidth / state.canvas.width, containerHeight / state.canvas.height), 4)
    )
    const wasAtInitialZoom = !isCanvasZoomed(state, initialCanvas)
    state.canvas.initialScale = newInitialScale
    if (refs.canvasContainer) {
      refs.canvasContainer.style.top = `${state.canvas.offset.top}px`
      refs.canvasContainer.style.left = `${state.canvas.offset.left}px`
    }
    if (wasAtInitialZoom) {
      state.canvas = {
        ...initialCanvas,
        scale: newInitialScale,
        initialScale: newInitialScale,
        rotation: 0,
        offset: state.canvas.offset,
        width: state.canvas.width,
        height: state.canvas.height,
        centerCoordX: state.canvas.centerCoordX,
        centerCoordY: state.canvas.centerCoordY,
      }
      updateZoomCss(state, refs, onUpdateDragBoxHandlers)
    }
  }
  initCanvasCenter(state, refs)
  if (refs.canvasOrigin) {
    const originRect = refs.canvasOrigin.getBoundingClientRect()
    state.canvas.originCoordX = round(originRect.left - state.canvas.offset.left, 1)
    state.canvas.originCoordY = round(originRect.top - state.canvas.offset.top, 1)
  }
  onUpdateDragBoxHandlers()
}

export const getMouseCoords = (
  state: EditorState,
  initialCanvas: EditorCanvasState,
  e: PointerTouchEvent | MouseEvent | TouchEvent
): [number, number] => {
  let x = getEventCoordX(e, state.canvas.offset.left)
  let y = getEventCoordY(e, state.canvas.offset.top)
  if (isCanvasZoomed(state, initialCanvas)) {
    ;[x, y] = getOriginalCoordsFromScaleRotation(
      x,
      y,
      state.canvas.originCoordX,
      state.canvas.originCoordY,
      state.canvas.scale,
      state.canvas.rotation
    )
  }
  return [round(x * Params.pxScale, 1), round(y * Params.pxScale, 1)]
}

export const getEditorChildCenterCoords = (
  state: EditorState,
  initialCanvas: EditorCanvasState,
  el: HTMLElement
): [number, number] => {
  let { centerX, centerY } = getDomRect(el, state.canvas.offset.left, state.canvas.offset.top)
  if (isCanvasZoomed(state, initialCanvas)) {
    ;[centerX, centerY] = getOriginalCoordsFromScaleRotation(
      centerX,
      centerY,
      state.canvas.originCoordX,
      state.canvas.originCoordY,
      state.canvas.scale,
      state.canvas.rotation
    )
  }
  return [round(centerX * Params.pxScale, 1), round(centerY * Params.pxScale, 1)]
}
