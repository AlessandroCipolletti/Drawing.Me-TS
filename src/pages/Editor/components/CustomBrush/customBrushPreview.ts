import Params from 'main/Params'
import { editorDefaultConfig } from 'pages/Editor/config'
import { getToolPreviewTouchEvents } from 'pages/Editor/brushPreviewPipeline'
import {
  applyOneEuroFilter,
  getAltitudeFactorFromAngle,
  getStepData,
} from 'pages/Editor/editorStepMath'
import {
  shouldAdaptStrokeLine,
  shouldThisStepMoveAdaptLine,
  updateCurrentTouchData,
  updateLastStepData,
} from 'pages/Editor/editorUtils'
import {
  createInitialEditorState,
  CurrentToolProps,
  EditorState,
  PointerTouchEvent,
} from 'pages/Editor/editorTypes'
import { drawStrokeSample, ExtendedCanvasContext, getNewContextForCanvas } from 'utils/canvasUtils'
import { getEventCoordX, getEventCoordY, preventDefault } from 'utils/domUtils'
import { round } from 'utils/mathUtils'
import {
  DeliveredPointerSample,
  filterFreshPointerSamples,
  normalizeTouchOrPointerEvent,
} from 'utils/pointerEventsUtils/touchEventsUtils'

export interface CustomBrushPreviewController {
  requestRender: () => void
  requestLatestRender: () => void
  renderNow: () => void
  resetToDefaultSamples: () => void
  getSamples: () => PointerTouchEvent[]
  destroy: () => void
}

interface PreviewStabState {
  lastX: number | null
  lastY: number | null
  velX: number
  velY: number
  lastTs: number
}

const createPreviewStabState = (): PreviewStabState => ({
  lastX: null,
  lastY: null,
  velX: 0,
  velY: 0,
  lastTs: 0,
})

const stabilizePreviewSample = (
  sample: PointerTouchEvent,
  index: number,
  state: PreviewStabState,
  stabilization: number
): PointerTouchEvent => {
  const pt = sample.touches?.[0]
  if (!pt) return sample
  const isStart = sample.type === Params.eventStart || sample.type === 'start'
  const isMove = sample.type === Params.eventMove || sample.type === 'move'
  const ts = sample.timeStamp || index * 8
  const dt = state.lastTs > 0 && ts > state.lastTs ? ts - state.lastTs : 8
  state.lastTs = ts
  const cx = pt.clientX ?? 0
  const cy = pt.clientY ?? 0

  if (isStart || state.lastX === null || state.lastY === null) {
    state.lastX = cx
    state.lastY = cy
    state.velX = 0
    state.velY = 0
    return sample
  }
  if (!isMove) return sample

  const [fx, vx] = applyOneEuroFilter(cx, state.lastX, state.velX, dt, stabilization)
  const [fy, vy] = applyOneEuroFilter(cy, state.lastY, state.velY, dt, stabilization)
  state.lastX = fx
  state.lastY = fy
  state.velX = vx
  state.velY = vy
  return {
    ...sample,
    touches: [{ clientX: fx, clientY: fy }],
  }
}

export const applyPreviewMotionStabilization = (
  samples: PointerTouchEvent[],
  stabilization = 0
): PointerTouchEvent[] => {
  if (!stabilization || stabilization <= 0 || samples.length < 3) {
    return samples
  }
  const state = createPreviewStabState()
  return samples.map((sample, index) => stabilizePreviewSample(sample, index, state, stabilization))
}

interface PreviewPointerSample {
  type: string
  cssX: number
  cssY: number
  timeStamp: number
  wallTime: number
  touchType?: string
  force?: number
  tangentialPressure?: number
  altitudeAngle?: number
  azimuthAngle?: number
  twist?: number
  hasTwist?: boolean
  predicted?: PreviewPointerSample[]
}

const createBitmap = (width: number, height: number): HTMLCanvasElement | OffscreenCanvas => {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  const bitmap = document.createElement('canvas')
  bitmap.width = width
  bitmap.height = height
  return bitmap
}

const toTouchEvent = (sample: PreviewPointerSample): PointerTouchEvent => ({
  type: sample.type,
  touches: [{ clientX: sample.cssX, clientY: sample.cssY }],
  clientX: sample.cssX,
  clientY: sample.cssY,
  timeStamp: sample.timeStamp,
  touchType: sample.touchType,
  force: sample.force,
  tangentialPressure: sample.tangentialPressure,
  altitudeAngle: sample.altitudeAngle,
  azimuthAngle: sample.azimuthAngle,
  twist: sample.twist,
  hasTwist: sample.hasTwist,
  predictedSamples: sample.predicted?.map((predicted) => toTouchEvent(predicted)),
})

export const createCustomBrushPreviewController = (
  canvas: HTMLCanvasElement,
  canvasLogicalSize: number,
  getToolProps: () => CurrentToolProps
): CustomBrushPreviewController => {
  const fallbackPixelSize = Math.max(64, round(canvasLogicalSize * Params.pxScale, 0))
  const initRect = canvas.getBoundingClientRect?.()
  const pixelWidth =
    initRect && initRect.width > 20
      ? Math.max(64, round(initRect.width * Params.pxScale, 0))
      : fallbackPixelSize
  const pixelHeight =
    initRect && initRect.height > 20
      ? Math.max(64, round(initRect.height * Params.pxScale, 0))
      : fallbackPixelSize

  canvas.width = pixelWidth
  canvas.height = pixelHeight
  const ctx: ExtendedCanvasContext = getNewContextForCanvas(canvas)
  const layerCanvas = createBitmap(canvas.width, canvas.height)
  const lineCanvas = createBitmap(canvas.width, canvas.height)
  const layerCtx = getNewContextForCanvas(layerCanvas)
  const lineCtx = getNewContextForCanvas(lineCanvas)
  const strokeState: EditorState = createInitialEditorState(
    editorDefaultConfig,
    getAltitudeFactorFromAngle(
      editorDefaultConfig.defaultAltitudeAngle,
      editorDefaultConfig.maxSupportedStylusAltitudeFactor
    )
  )
  const blankTouch = { ...strokeState.currentTouch }

  const bitmapToCss = (bitmap: number) => bitmap / (Params.pxScale || 1)

  const buildDefaultSamples = (): PreviewPointerSample[] => {
    const w = canvas.width || fallbackPixelSize
    const h = canvas.height || fallbackPixelSize
    const minSide = Math.min(w, h)
    const offsetX = (w - minSide) / 2
    const offsetY = (h - minSide) / 2
    return getToolPreviewTouchEvents(minSide).map((sample, idx) => {
      const point = sample.touches[0]
      const timeStamp = (idx + 1) * 14
      return {
        type: String(sample.type),
        cssX: bitmapToCss((point?.clientX || 0) + offsetX),
        cssY: bitmapToCss((point?.clientY || 0) + offsetY),
        timeStamp,
        wallTime: timeStamp,
        touchType: sample.touchType,
        force: sample.force,
        altitudeAngle: sample.altitudeAngle,
        azimuthAngle: sample.azimuthAngle,
      }
    })
  }

  let activeSamples: PreviewPointerSample[] = buildDefaultSamples()
  let hasUserDrawnStroke = false
  let isDrawing = false
  let needsFullRedraw = true
  let rafId = 0
  let playedCount = 0
  let lastDelivered: DeliveredPointerSample | null = null

  const syncCanvasDimensionsIfNeeded = (): boolean => {
    const rect = canvas.getBoundingClientRect?.()
    if (!rect || rect.width <= 20 || rect.height <= 20) return false
    const targetW = Math.max(64, round(rect.width * Params.pxScale, 0))
    const targetH = Math.max(64, round(rect.height * Params.pxScale, 0))
    if (Math.abs(canvas.width - targetW) > 2 || Math.abs(canvas.height - targetH) > 2) {
      canvas.width = targetW
      canvas.height = targetH
      if (!hasUserDrawnStroke) {
        activeSamples = buildDefaultSamples()
      }
      return true
    }
    return false
  }

  const resizeBitmap = (bitmap: HTMLCanvasElement | OffscreenCanvas) => {
    if (bitmap.width !== canvas.width) bitmap.width = canvas.width
    if (bitmap.height !== canvas.height) bitmap.height = canvas.height
  }

  const syncStrokeBitmapSize = () => {
    resizeBitmap(layerCanvas)
    resizeBitmap(lineCanvas)
  }

  const useToolProps = () => {
    strokeState.currentToolProps = getToolProps()
    return strokeState.currentToolProps
  }

  const resetStrokeState = () => {
    strokeState.currentTouch = { ...blankTouch }
    strokeState.lastStep = {}
    strokeState.lastAdaptedStep = {}
    strokeState.lastLineAdaptationTimestamp = 0
    strokeState.stepsSinceLastLineAdaptation = 0
    strokeState.pxDistanceSinceLastLineAdaptation = 0
    strokeState.hasPredictedOverlay = false
    strokeState.currentDeviceHasStylus = false
  }

  const clearStrokeBitmaps = () => {
    layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height)
    lineCtx.clearRect(0, 0, lineCanvas.width, lineCanvas.height)
    layerCtx.lastDrawCoordX = -1
    layerCtx.lastDrawCoordY = -1
    lineCtx.lastDrawCoordX = -1
    lineCtx.lastDrawCoordY = -1
    layerCtx.globalAlpha = 1
    lineCtx.globalAlpha = 1
    layerCtx.globalCompositeOperation = 'source-over'
    lineCtx.globalCompositeOperation = 'source-over'
  }

  const present = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(layerCanvas, 0, 0)
    ctx.drawImage(lineCanvas, 0, 0)
  }

  const drawCommittedStep = (context: ExtendedCanvasContext, type: 'start' | 'move' | 'end') => {
    const step = getStepData(
      strokeState.currentToolProps,
      strokeState.currentTouch,
      strokeState.lastStep
    )
    drawStrokeSample(context, { ...step, type }, strokeState.currentToolProps, true)
    updateLastStepData(strokeState, step)
  }

  const renderPredictedOverlay = (sample: PreviewPointerSample) => {
    const tool = strokeState.currentToolProps
    if (
      !strokeState.currentTouch.isDown ||
      strokeState.currentTouch.isNearRuler ||
      !tool.usePredictedEvents ||
      tool.globalCompositeOperation === 'destination-out' ||
      !sample.predicted?.length
    ) {
      return
    }
    const predBlend =
      typeof tool.predictedEventsBlend === 'number' && !Number.isNaN(tool.predictedEventsBlend)
        ? tool.predictedEventsBlend
        : 1
    if (predBlend <= 0) return
    const predTool = predBlend === 1 ? tool : { ...tool, flow: (tool.flow ?? 1) * predBlend }
    const savedTouch = { ...strokeState.currentTouch }
    const savedLastStep = { ...strokeState.lastStep }
    lineCtx.lastDrawCoordX = layerCtx.lastDrawCoordX
    lineCtx.lastDrawCoordY = layerCtx.lastDrawCoordY
    for (const predicted of sample.predicted) {
      updateCurrentTouchData(
        strokeState,
        toTouchEvent(predicted),
        Params.eventMove,
        predicted.cssX,
        predicted.cssY
      )
      const predStep = getStepData(tool, strokeState.currentTouch, strokeState.lastStep)
      drawStrokeSample(lineCtx, { ...predStep, type: 'move' }, predTool, true)
      updateLastStepData(strokeState, predStep)
    }
    strokeState.currentTouch = savedTouch
    strokeState.lastStep = savedLastStep
    strokeState.hasPredictedOverlay = true
  }

  const playStart = (sample: PreviewPointerSample) => {
    useToolProps()
    strokeState.currentTouch = { ...blankTouch }
    strokeState.lastStep = {}
    strokeState.lastAdaptedStep = {}
    strokeState.hasPredictedOverlay = false
    strokeState.lastLineAdaptationTimestamp = sample.wallTime
    strokeState.stepsSinceLastLineAdaptation = 0
    updateCurrentTouchData(
      strokeState,
      toTouchEvent(sample),
      Params.eventStart,
      sample.cssX,
      sample.cssY
    )
    strokeState.currentTouch.isDown = true
    drawCommittedStep(layerCtx, 'start')
    if (shouldAdaptStrokeLine(strokeState.currentToolProps)) {
      strokeState.lastAdaptedStep = { ...strokeState.lastStep }
      strokeState.pxDistanceSinceLastLineAdaptation = 0
      lineCtx.lastDrawCoordX = layerCtx.lastDrawCoordX
      lineCtx.lastDrawCoordY = layerCtx.lastDrawCoordY
      lineCtx.clearRect(0, 0, lineCanvas.width, lineCanvas.height)
    }
  }

  const playMove = (sample: PreviewPointerSample) => {
    if (strokeState.hasPredictedOverlay) {
      lineCtx.clearRect(0, 0, lineCanvas.width, lineCanvas.height)
      strokeState.hasPredictedOverlay = false
    }
    if (!strokeState.currentTouch.isDown) return
    useToolProps()
    const event = toTouchEvent(sample)
    updateCurrentTouchData(strokeState, event, Params.eventMove, sample.cssX, sample.cssY)
    if (shouldAdaptStrokeLine(strokeState.currentToolProps)) {
      const adapted = shouldThisStepMoveAdaptLine(strokeState, sample.wallTime)
      if (adapted) {
        strokeState.lastStep = { ...strokeState.lastAdaptedStep }
        updateCurrentTouchData(strokeState, event, Params.eventMove, sample.cssX, sample.cssY, true)
      }
      drawCommittedStep(adapted ? layerCtx : lineCtx, 'move')
      if (adapted) {
        strokeState.lastAdaptedStep = { ...strokeState.lastStep }
        lineCtx.lastDrawCoordX = layerCtx.lastDrawCoordX
        lineCtx.lastDrawCoordY = layerCtx.lastDrawCoordY
        lineCtx.clearRect(0, 0, lineCanvas.width, lineCanvas.height)
        renderPredictedOverlay(sample)
      }
    } else {
      drawCommittedStep(layerCtx, 'move')
      renderPredictedOverlay(sample)
    }
  }

  const playEnd = (sample: PreviewPointerSample) => {
    if (strokeState.hasPredictedOverlay) {
      lineCtx.clearRect(0, 0, lineCanvas.width, lineCanvas.height)
      strokeState.hasPredictedOverlay = false
    }
    useToolProps()
    const event = toTouchEvent(sample)
    if (shouldAdaptStrokeLine(strokeState.currentToolProps)) {
      lineCtx.clearRect(0, 0, lineCanvas.width, lineCanvas.height)
      if (
        typeof strokeState.lastAdaptedStep.x === 'number' &&
        (strokeState.lastStep.x !== strokeState.lastAdaptedStep.x ||
          strokeState.lastStep.y !== strokeState.lastAdaptedStep.y)
      ) {
        strokeState.lastStep = { ...strokeState.lastAdaptedStep }
        updateCurrentTouchData(strokeState, event, Params.eventMove, sample.cssX, sample.cssY)
        drawCommittedStep(layerCtx, 'move')
        strokeState.lastAdaptedStep = { ...strokeState.lastStep }
      }
    }
    updateCurrentTouchData(strokeState, event, Params.eventEnd, sample.cssX, sample.cssY)
    strokeState.currentTouch.isDown = false
    strokeState.currentTouch.isNearRuler = false
    const hasMoved =
      strokeState.currentTouch.x !== strokeState.lastStep.x ||
      strokeState.currentTouch.y !== strokeState.lastStep.y
    const hasUnfinished =
      Boolean(strokeState.currentToolProps.completeEndSegment) &&
      typeof strokeState.lastStep.x === 'number' &&
      typeof strokeState.lastStep.midX === 'number' &&
      (strokeState.lastStep.x !== strokeState.lastStep.midX ||
        strokeState.lastStep.y !== strokeState.lastStep.midY)
    if (hasMoved || hasUnfinished) {
      drawCommittedStep(layerCtx, 'end')
    }
  }

  const playSample = (sample: PreviewPointerSample) => {
    if (sample.type === Params.eventStart || sample.type === 'start') playStart(sample)
    else if (sample.type === Params.eventEnd || sample.type === 'end') playEnd(sample)
    else playMove(sample)
  }

  const replayAll = () => {
    syncCanvasDimensionsIfNeeded()
    syncStrokeBitmapSize()
    clearStrokeBitmaps()
    resetStrokeState()
    for (const sample of activeSamples) playSample(sample)
    playedCount = activeSamples.length
    present()
  }

  const playPending = () => {
    syncStrokeBitmapSize()
    const now = Date.now()
    let played = false
    while (playedCount < activeSamples.length) {
      const sample = activeSamples[playedCount]
      if (!sample.wallTime) sample.wallTime = now
      playSample(sample)
      playedCount++
      played = true
    }
    if (played) present()
  }

  const cancelSchedule = () => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  const flushFrame = () => {
    rafId = 0
    const resized = syncCanvasDimensionsIfNeeded()
    if (needsFullRedraw || resized) {
      needsFullRedraw = false
      replayAll()
      return
    }
    playPending()
  }

  const schedule = () => {
    if (rafId) return
    rafId = requestAnimationFrame(flushFrame)
  }

  const renderNow = () => {
    cancelSchedule()
    needsFullRedraw = false
    replayAll()
  }

  const requestRender = () => {
    needsFullRedraw = true
    schedule()
  }

  const requestLatestRender = () => {
    needsFullRedraw = true
    schedule()
  }

  const resetToDefaultSamples = () => {
    hasUserDrawnStroke = false
    syncCanvasDimensionsIfNeeded()
    activeSamples = buildDefaultSamples()
    needsFullRedraw = true
    schedule()
  }

  const sampleFromPointer = (
    raw: Event | PointerEvent | Touch,
    type: string,
    rect: DOMRect,
    wallTime = 0
  ): PreviewPointerSample => {
    const norm = normalizeTouchOrPointerEvent(raw)
    const clientX = typeof norm?.clientX === 'number' ? norm.clientX : getEventCoordX(raw)
    const clientY = typeof norm?.clientY === 'number' ? norm.clientY : getEventCoordY(raw)
    return {
      type,
      cssX: clientX - rect.left,
      cssY: clientY - rect.top,
      timeStamp: norm?.timeStamp || Date.now(),
      wallTime,
      touchType: norm?.touchType,
      force: norm?.force,
      tangentialPressure: norm?.tangentialPressure,
      altitudeAngle: norm?.altitudeAngle,
      azimuthAngle: norm?.azimuthAngle,
      twist: norm?.twist,
      hasTwist: norm?.hasTwist,
    }
  }

  const onPointerMove = (e: Event) => {
    if (!isDrawing) return
    preventDefault(e)
    e.stopPropagation()
    const pointer = e as PointerEvent
    const rect = canvas.getBoundingClientRect()
    const coalesced =
      typeof pointer.getCoalescedEvents === 'function' ? pointer.getCoalescedEvents() : []
    const source = coalesced.length > 0 ? coalesced : [e]
    const normalized = source.map((ev) => normalizeTouchOrPointerEvent(ev))
    const filtered = filterFreshPointerSamples(normalized, lastDelivered)
    if (filtered.last) lastDelivered = filtered.last
    if (!filtered.fresh.length) return

    const samples = filtered.fresh.map((ev) =>
      sampleFromPointer(ev as PointerEvent, Params.eventMove, rect)
    )
    if (typeof pointer.getPredictedEvents === 'function' && samples.length) {
      const rawPredicted = pointer.getPredictedEvents()
      if (Array.isArray(rawPredicted) && rawPredicted.length > 0) {
        samples[samples.length - 1].predicted = rawPredicted
          .slice(0, 3)
          .map((ev) => sampleFromPointer(ev, Params.eventMove, rect))
      }
    }
    activeSamples.push(...samples)
    schedule()
  }

  const onPointerEnd = (e: Event) => {
    if (!isDrawing) return
    preventDefault(e)
    e.stopPropagation()
    isDrawing = false
    document.removeEventListener(Params.eventMove, onPointerMove)
    document.removeEventListener(Params.eventEnd, onPointerEnd)
    activeSamples.push(sampleFromPointer(e, Params.eventEnd, canvas.getBoundingClientRect()))
    cancelSchedule()
    flushFrame()
  }

  const onPointerStart = (e: Event) => {
    const evt = e as PointerEvent & TouchEvent
    if (
      (typeof evt.button === 'number' && evt.button > 0) ||
      (evt.touches && evt.touches.length > 1)
    ) {
      return
    }
    preventDefault(e)
    e.stopPropagation()
    isDrawing = true
    hasUserDrawnStroke = true
    lastDelivered = null
    cancelSchedule()
    activeSamples = [
      sampleFromPointer(e, Params.eventStart, canvas.getBoundingClientRect(), Date.now()),
    ]
    needsFullRedraw = false
    replayAll()

    document.addEventListener(Params.eventMove, onPointerMove)
    document.addEventListener(Params.eventEnd, onPointerEnd)
  }

  canvas.addEventListener(Params.eventStart, onPointerStart)

  return {
    requestRender,
    requestLatestRender,
    renderNow,
    resetToDefaultSamples,
    getSamples: () => activeSamples.map(toTouchEvent),
    destroy: () => {
      needsFullRedraw = false
      cancelSchedule()
      canvas.removeEventListener(Params.eventStart, onPointerStart)
      document.removeEventListener(Params.eventMove, onPointerMove)
      document.removeEventListener(Params.eventEnd, onPointerEnd)
    },
  }
}
