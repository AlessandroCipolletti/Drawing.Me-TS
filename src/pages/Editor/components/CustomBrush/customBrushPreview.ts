import Params from 'main/Params'
import { getToolPreviewTouchEvents, renderBrushPreview } from 'pages/Editor/brushPreviewPipeline'
import { applyOneEuroFilter } from 'pages/Editor/editorStepMath'
import { CurrentToolProps, PointerTouchEvent } from 'pages/Editor/editorTypes'
import { ExtendedCanvasContext, getNewContextForCanvas } from 'utils/canvasUtils'
import { getEventCoordX, getEventCoordY, preventDefault } from 'utils/domUtils'
import { round } from 'utils/mathUtils'
import { normalizeTouchOrPointerEvent } from 'utils/pointerEventsUtils/touchEventsUtils'

export interface CustomBrushPreviewController {
  requestRender: () => void
  renderNow: () => void
  resetToDefaultSamples: () => void
  getSamples: () => PointerTouchEvent[]
  destroy: () => void
}

export const applyPreviewMotionStabilization = (
  samples: PointerTouchEvent[],
  stabilization = 0
): PointerTouchEvent[] => {
  if (!stabilization || stabilization <= 0 || samples.length < 3) {
    return samples
  }
  const out: PointerTouchEvent[] = []
  let lastX: number | null = null
  let lastY: number | null = null
  let velX = 0
  let velY = 0
  let lastTs = 0

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    const pt = s.touches?.[0]
    if (!pt) {
      out.push(s)
      continue
    }
    const isStart = s.type === Params.eventStart || s.type === 'start'
    const isMove = s.type === Params.eventMove || s.type === 'move'
    const ts = s.timeStamp || i * 8
    const dt = lastTs > 0 && ts > lastTs ? ts - lastTs : 8
    lastTs = ts
    const cx = pt.clientX ?? 0
    const cy = pt.clientY ?? 0

    if (isStart || lastX === null || lastY === null) {
      lastX = cx
      lastY = cy
      velX = 0
      velY = 0
      out.push(s)
    } else if (isMove) {
      const [fx, vx] = applyOneEuroFilter(cx, lastX, velX, dt, stabilization)
      const [fy, vy] = applyOneEuroFilter(cy, lastY, velY, dt, stabilization)
      lastX = fx
      lastY = fy
      velX = vx
      velY = vy
      out.push({
        ...s,
        touches: [{ clientX: fx, clientY: fy }],
      })
    } else {
      out.push(s)
    }
  }
  return out
}

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

  const buildDefaultSamples = (): PointerTouchEvent[] => {
    const w = canvas.width || fallbackPixelSize
    const h = canvas.height || fallbackPixelSize
    const minSide = Math.min(w, h)
    const offsetX = round((w - minSide) / 2, 1)
    const offsetY = round((h - minSide) / 2, 1)
    return getToolPreviewTouchEvents(minSide).map((sample, idx) => ({
      ...(sample as unknown as PointerTouchEvent),
      touches: sample.touches.map((t) => ({
        clientX: round(t.clientX + offsetX, 1),
        clientY: round(t.clientY + offsetY, 1),
      })),
      timeStamp: (idx + 1) * 14,
    }))
  }

  let activeSamples: PointerTouchEvent[] = buildDefaultSamples()
  let hasUserDrawnStroke = false
  let rafPending = false
  let isDrawing = false

  const syncCanvasDimensionsIfNeeded = () => {
    const rect = canvas.getBoundingClientRect?.()
    if (!rect || rect.width <= 20 || rect.height <= 20) return
    const targetW = Math.max(64, round(rect.width * Params.pxScale, 0))
    const targetH = Math.max(64, round(rect.height * Params.pxScale, 0))
    if (Math.abs(canvas.width - targetW) > 2 || Math.abs(canvas.height - targetH) > 2) {
      canvas.width = targetW
      canvas.height = targetH
      if (!hasUserDrawnStroke) {
        activeSamples = buildDefaultSamples()
      }
    }
  }

  const renderNow = () => {
    rafPending = false
    syncCanvasDimensionsIfNeeded()
    const toolProps = getToolProps()
    const effectiveSamples = applyPreviewMotionStabilization(
      activeSamples,
      toolProps.stabilization || 0
    )
    renderBrushPreview(ctx, toolProps, effectiveSamples)
  }

  const requestRender = () => {
    if (!rafPending) {
      rafPending = true
      requestAnimationFrame(renderNow)
    }
  }

  const resetToDefaultSamples = () => {
    hasUserDrawnStroke = false
    syncCanvasDimensionsIfNeeded()
    activeSamples = buildDefaultSamples()
    requestRender()
  }

  const eventToSample = (e: Event, type: string): PointerTouchEvent => {
    const raw =
      (e as TouchEvent).touches?.[0] || (e as TouchEvent).changedTouches?.[0] || (e as PointerEvent)
    const norm = normalizeTouchOrPointerEvent(raw)
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / Math.max(1, rect.width || canvasLogicalSize)
    const scaleY = canvas.height / Math.max(1, rect.height || canvasLogicalSize)
    const rawClientX = typeof norm?.clientX === 'number' ? norm.clientX : getEventCoordX(e)
    const rawClientY = typeof norm?.clientY === 'number' ? norm.clientY : getEventCoordY(e)
    const x = round((rawClientX - rect.left) * scaleX, 1)
    const y = round((rawClientY - rect.top) * scaleY, 1)

    return {
      touches: [{ clientX: x, clientY: y }],
      type,
      touchType: norm?.touchType,
      force: norm?.force,
      tangentialPressure: norm?.tangentialPressure,
      altitudeAngle: norm?.altitudeAngle,
      azimuthAngle: norm?.azimuthAngle,
      twist: norm?.twist,
      hasTwist: norm?.hasTwist,
      timeStamp: norm?.timeStamp || Date.now(),
    }
  }

  const onPointerMove = (e: Event) => {
    if (!isDrawing) return
    preventDefault(e)
    e.stopPropagation()
    const sample = eventToSample(e, Params.eventMove)
    const prev = activeSamples[activeSamples.length - 1]?.touches?.[0]
    const curr = sample.touches?.[0]
    if (prev && curr && prev.clientX === curr.clientX && prev.clientY === curr.clientY) {
      return
    }
    activeSamples.push(sample)
    requestRender()
  }

  const onPointerEnd = (e: Event) => {
    if (!isDrawing) return
    preventDefault(e)
    e.stopPropagation()
    isDrawing = false
    document.removeEventListener(Params.eventMove, onPointerMove)
    document.removeEventListener(Params.eventEnd, onPointerEnd)

    const endSample = eventToSample(e, Params.eventEnd)
    activeSamples.push(endSample)
    renderNow()
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
    syncCanvasDimensionsIfNeeded()

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const startSample = eventToSample(e, Params.eventStart)
    activeSamples = [startSample]
    renderNow()

    document.addEventListener(Params.eventMove, onPointerMove)
    document.addEventListener(Params.eventEnd, onPointerEnd)
  }

  canvas.addEventListener(Params.eventStart, onPointerStart)

  return {
    requestRender,
    renderNow,
    resetToDefaultSamples,
    getSamples: () => activeSamples,
    destroy: () => {
      canvas.removeEventListener(Params.eventStart, onPointerStart)
      document.removeEventListener(Params.eventMove, onPointerMove)
      document.removeEventListener(Params.eventEnd, onPointerEnd)
    },
  }
}
