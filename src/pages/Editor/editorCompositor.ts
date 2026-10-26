import Params from 'main/Params'
import * as Layers from './components/Layers'
import { isLayerMasked } from './components/Layers/layerMask'
import { renderLassoOverlayFrame } from './components/Layers/layerLasso'
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
  CurrentToolProps,
  EditorCanvasState,
  EditorState,
  PointerTouchEvent,
  ResizeModeState,
} from './editorTypes'
import { initPipetteCursor } from './editorLifecycle'

let resizeRafId: number | null = null
let pendingResizeFrame: {
  madeChanges: boolean
  x: number
  y: number
  w: number
  h: number
  r: number
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
  if (tool.name === 'pipette') {
    initPipetteCursor(state, initialCanvas, refs, coordsAreInsideLayer)
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

export const stopLassoMarchingAnts = () => {
  if (lassoAntsRafId !== null) {
    cancelAnimationFrame(lassoAntsRafId)
    lassoAntsRafId = null
  }
}

const startLassoMarchingAnts = (state: EditorState, refs: EditorRefs) => {
  stopLassoMarchingAnts()
  const step = () => {
    if (!state.lassoMode?.active || !state.lassoMode.hasSelection || !refs.lassoCanvas) {
      lassoAntsRafId = null
      return
    }
    lassoDashOffset = (lassoDashOffset + 0.35) % 11
    renderLassoOverlayFrame(
      refs.lassoCanvas,
      state.lassoMode.points,
      true,
      state.canvas.scale,
      lassoDashOffset
    )
    lassoAntsRafId = requestAnimationFrame(step)
  }
  lassoAntsRafId = requestAnimationFrame(step)
}

export const updateLassoBarPosition = (state: EditorState, refs: EditorRefs) => {
  if (!refs.lassoBar || !state.lassoMode?.active || !state.lassoMode.hasSelection) return
  const canCreateNewLayer = Layers.canCreateLayerFromLasso()
  refs.lassoCutButton?.classList.toggle('disabled', !canCreateNewLayer)
  refs.lassoCopyButton?.classList.toggle('disabled', !canCreateNewLayer)

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
  const barW = barRect.width || 280
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

  refs.lassoBar.style.left = `${round(targetLeft, 0)}px`
  refs.lassoBar.style.top = `${round(targetTop, 0)}px`
}

export const clearLassoSelectionOverlay = (state: EditorState, refs: EditorRefs) => {
  stopLassoMarchingAnts()
  if (state.lassoMode) {
    state.lassoMode.isDrawing = false
    state.lassoMode.hasSelection = false
    state.lassoMode.points = []
    state.lassoMode.minX = -1
    state.lassoMode.minY = -1
    state.lassoMode.maxX = -1
    state.lassoMode.maxY = -1
  }
  if (refs.lassoCanvas) {
    const ctx = refs.lassoCanvas.getContext('2d')
    ctx?.clearRect(0, 0, refs.lassoCanvas.width, refs.lassoCanvas.height)
  }
  refs.lassoBar?.classList.add('displayNone')
}

export const setLassoModeActive = (state: EditorState, refs: EditorRefs, active: boolean) => {
  clearLassoSelectionOverlay(state, refs)
  if (state.lassoMode) {
    state.lassoMode.active = active
  }
  refs.lassoCanvas?.classList.toggle('displayNone', !active)
}

export const showLassoSelectionOverlay = (
  state: EditorState,
  refs: EditorRefs,
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
) => {
  state.lassoMode.isDrawing = false
  state.lassoMode.hasSelection = true
  state.lassoMode.minX = bounds.minX
  state.lassoMode.minY = bounds.minY
  state.lassoMode.maxX = bounds.maxX
  state.lassoMode.maxY = bounds.maxY
  refs.lassoBar?.classList.remove('displayNone')
  updateLassoBarPosition(state, refs)
  startLassoMarchingAnts(state, refs)
}

export const updateDragBoxHandlersPosition = (refs: EditorRefs) => {
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
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  if (!refs.dragBox || !state.resizeMode?.active) return
  refs.dragBox.style.cssText = `
    left: ${round(x / Params.pxScale, 1)}px;
    top: ${round(y / Params.pxScale, 1)}px;
    width: ${round(w / Params.pxScale, 1)}px;
    height: ${round(h / Params.pxScale, 1)}px;
    transform: translate3d(-50%, -50%, 0px) rotate3d(0, 0, 1, ${r}deg);
  `
  updateDragBoxHandlersPosition(refs)
  Layers.updateCanvasContent(madeChanges, x, y, w, h, r)
}

export const flushPendingResizeFrame = (state: EditorState, refs: EditorRefs) => {
  if (pendingResizeFrame) {
    const frame = pendingResizeFrame
    cancelPendingResizeRaf()
    commitDragBoxFrame(state, refs, frame.madeChanges, frame.x, frame.y, frame.w, frame.h, frame.r)
  } else {
    cancelPendingResizeRaf()
  }
}

const updateDragBox = (
  state: EditorState,
  refs: EditorRefs,
  madeChanges: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 0
) => {
  if (!refs.dragBox) return
  state.resizeMode = {
    ...state.resizeMode,
    x,
    y,
    w,
    h,
    r,
  }
  if (!madeChanges) {
    cancelPendingResizeRaf()
    commitDragBoxFrame(state, refs, false, x, y, w, h, r)
    return
  }
  pendingResizeFrame = { madeChanges, x, y, w, h, r }
  if (resizeRafId === null) {
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = null
      const frame = pendingResizeFrame
      pendingResizeFrame = null
      if (frame) {
        commitDragBoxFrame(
          state,
          refs,
          frame.madeChanges,
          frame.x,
          frame.y,
          frame.w,
          frame.h,
          frame.r
        )
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
  fadeInElements(
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
    ].filter(Boolean) as HTMLElement[]
  )
  updateDragBox(state, refs, false, x, y, w, h)
}

export const hideDragBox = (state: EditorState, refs: EditorRefs) => {
  flushPendingResizeFrame(state, refs)
  state.resizeMode.active = false
  state.resizeMode.w =
    state.resizeMode.h =
    state.resizeMode.x =
    state.resizeMode.y =
    state.resizeMode.r =
      -1
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
    ].filter(Boolean) as HTMLElement[]
  )
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
    const step = (now: number) => {
      updateDragBoxHandlersPosition(refs)
      onStep?.()
      if (now - startTime < duration) {
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
  const rad = ((state.resizeMode.r || 0) * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const boundW = state.resizeMode.w * cos + state.resizeMode.h * sin
  const boundH = state.resizeMode.w * sin + state.resizeMode.h * cos
  Layers.setLayerCoordsAfterDragResize(
    Math.max(0, round(state.resizeMode.x - boundW / 2)),
    Math.max(0, round(state.resizeMode.y - boundH / 2)),
    Math.min(state.canvas.width, round(state.resizeMode.x + boundW / 2)),
    Math.min(state.canvas.height, round(state.resizeMode.y + boundH / 2))
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

  updateDragBox(
    state,
    refs,
    true,
    newResizeState.x,
    newResizeState.y,
    newResizeState.w,
    newResizeState.h,
    newResizeState.r
  )
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

  updateDragBox(
    state,
    refs,
    true,
    round(newX, 1),
    round(newY, 1),
    state.resizeMode.w,
    state.resizeMode.h,
    state.resizeMode.r
  )
}
