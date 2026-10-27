import Params from 'main/Params'
import { TOUCH_TYPE_STYLUS } from 'main/constants'
import { ExtendedCanvasContext, StrokeSample } from 'utils/canvasUtils'

export const SMUDGE_INPUT_FINGER = 0
export const SMUDGE_INPUT_PEN = 1

export type SmudgeInputKind = typeof SMUDGE_INPUT_FINGER | typeof SMUDGE_INPUT_PEN

export const smudgeTouchTypeToInputKind = (touchType: string): SmudgeInputKind =>
  touchType === TOUCH_TYPE_STYLUS ? SMUDGE_INPUT_PEN : SMUDGE_INPUT_FINGER

/** Memory window, as a multiple of the current brush diameter. */
const SMUDGE_MEMORY_DIAMETERS = 5

/**
 * How far (in canvas px travelled) paint picked up by the brush survives
 * before being exchanged away. Proportional to the selected brush size:
 * a bigger brush carries its paint for a proportionally longer trail.
 */
export const getSmudgeMemoryLengthPx = (brushDiameter: number): number =>
  clamp(Math.round(brushDiameter * SMUDGE_MEMORY_DIAMETERS), 40, 1200)

const MAX_DIAMETER_PX = 384
const FINGER_SIZE_MULTIPLIER = 1.55
const FINGER_DEADZONE_PX = 8
const PEN_MIN_MOVE_PX = 2
const MAX_DABS_PER_STEP = 32
const SAMPLE_CANVAS_SIZE = 32
const SAMPLE_TINY_SIZE = 8

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const getStrokeDiameter = (size: number, inputKind: SmudgeInputKind): number => {
  const scaled = inputKind === SMUDGE_INPUT_FINGER ? size * FINGER_SIZE_MULTIPLIER : size
  return clamp(Math.round(scaled), 4, MAX_DIAMETER_PX)
}

export interface SmudgeDabParams {
  /** Opacity with which the accumulation buffer is stamped back each dab. */
  deposit: number
  /** Distance between dabs, as a fraction of the brush diameter. */
  spacingRatio: number
  /**
   * Per-dab exchange rate between the accumulation buffer and the paint
   * under the brush (GIMP/MyPaint model: Accum = rate kept, rest exchanged).
   * Chosen so paint survives roughly `memoryLengthPx` of travel.
   */
  pickup: number
  /** Distance travelled between two live-alpha readings. */
  sampleIntervalPx: number
  /** Distance over which picked-up paint is remembered. */
  memoryLengthPx: number
  /** Alpha removed per application from existing paint while the buffer is transparent. */
  dilute: number
  /** Travel distance between two (expensive) dilution applications. */
  transparentSpacingPx: number
}

export const getSmudgeDabParams = (
  inputKind: SmudgeInputKind,
  strength: number,
  brushDiameter = 50
): SmudgeDabParams => {
  const s = clamp(strength, 0.02, 1)
  const memoryLengthPx = getSmudgeMemoryLengthPx(brushDiameter)
  const spacingPx = Math.max(1.25, brushDiameter * (inputKind === SMUDGE_INPUT_PEN ? 0.04 : 0.055))
  // Exchange distance (spacing / pickup) should be a good fraction of the
  // memory window, for both inputs and at any brush size.
  const pickupBase = clamp((2.2 * spacingPx) / memoryLengthPx, 0.02, 0.5)
  if (inputKind === SMUDGE_INPUT_PEN) {
    return {
      deposit: clamp(0.16 + s * 0.52, 0.05, 0.68),
      spacingRatio: 0.04,
      pickup: pickupBase,
      sampleIntervalPx: clamp(brushDiameter * 0.07, 3, 9),
      memoryLengthPx,
      dilute: 0.22,
      transparentSpacingPx: clamp(brushDiameter * 0.18, 8, 28),
    }
  }
  return {
    deposit: clamp(0.14 + s * 0.4, 0.05, 0.54),
    spacingRatio: 0.055,
    // Finger exchanges paint faster: colours knead together in place
    // instead of streaking as far as with the pencil.
    pickup: clamp(pickupBase * 1.5, 0.03, 0.65),
    sampleIntervalPx: clamp(brushDiameter * 0.08, 4, 11),
    memoryLengthPx,
    dilute: 0.28,
    transparentSpacingPx: clamp(brushDiameter * 0.16, 8, 28),
  }
}

const createCanvas = (): HTMLCanvasElement | null => {
  if (typeof document === 'undefined') return null
  return document.createElement('canvas')
}

const ensureCanvas = (
  existing: HTMLCanvasElement | null,
  width: number,
  height: number
): HTMLCanvasElement | null => {
  const canvas = existing ?? createCanvas()
  if (!canvas) return null
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  return canvas
}

/** Soft elliptical falloff, rebuilt only when the brush size changes. */
const rebuildMask = (session: SmudgeStrokeSession, width: number, height: number) => {
  const key = width * 100000 + height
  if (session.maskDiameter.value === key || !session.maskCanvas) return
  session.maskDiameter.value = key
  const maskCanvas = session.maskCanvas
  if (maskCanvas.width !== width) maskCanvas.width = width
  if (maskCanvas.height !== height) maskCanvas.height = height
  const ctx = maskCanvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.scale(width / 2, height / 2)
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  gradient.addColorStop(0, 'rgba(255,255,255,0.98)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.85)')
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.42)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export interface SmudgeStrokeSession {
  inputKind: SmudgeInputKind
  strokeStartX: number
  strokeStartY: number
  lastDabX: number
  lastDabY: number
  totalTravel: number
  hasDabbed: boolean
  started: boolean
  /** Brush diameter locked at stroke start so pressure never resizes mid-streak. */
  brushDiameter: number
  brushAspect: number
  /**
   * Brush-sized accumulation buffer (the classic smudge model used by
   * GIMP, MyPaint and Krita's smearing mode): paint texture the brush is
   * currently carrying, exchanged per-pixel with the live layer each dab.
   */
  accumCanvas: HTMLCanvasElement | null
  hasAccum: boolean
  /** Running estimate of the average alpha inside the accumulation buffer. */
  accumAlpha: number
  distanceSinceSample: number
  distanceSinceTransparentLoad: number
  stampCanvas: HTMLCanvasElement | null
  workCanvas: HTMLCanvasElement | null
  sampleCanvas: HTMLCanvasElement | null
  tinySampleCanvas: HTMLCanvasElement | null
  maskCanvas: HTMLCanvasElement | null
  maskDiameter: { value: number }
}

export const createSmudgeStrokeSession = (): SmudgeStrokeSession => ({
  inputKind: SMUDGE_INPUT_PEN,
  strokeStartX: 0,
  strokeStartY: 0,
  lastDabX: 0,
  lastDabY: 0,
  totalTravel: 0,
  hasDabbed: false,
  started: false,
  brushDiameter: 0,
  brushAspect: 1,
  accumCanvas: null,
  hasAccum: false,
  accumAlpha: 0,
  distanceSinceSample: 0,
  distanceSinceTransparentLoad: 0,
  stampCanvas: null,
  workCanvas: null,
  sampleCanvas: null,
  tinySampleCanvas: null,
  maskCanvas: null,
  maskDiameter: { value: -1 },
})

export const resetSmudgeStrokeSession = (session: SmudgeStrokeSession) => {
  session.accumCanvas = null
  session.hasAccum = false
  session.accumAlpha = 0
  session.distanceSinceSample = 0
  session.distanceSinceTransparentLoad = 0
  session.stampCanvas = null
  session.workCanvas = null
  session.sampleCanvas = null
  session.tinySampleCanvas = null
  session.maskCanvas = null
  session.maskDiameter.value = -1
  session.hasDabbed = false
  session.started = false
  session.brushDiameter = 0
  session.totalTravel = 0
}

const beginSmudgeStroke = (
  session: SmudgeStrokeSession,
  inputKind: SmudgeInputKind,
  x: number,
  y: number
) => {
  session.inputKind = inputKind
  session.strokeStartX = x
  session.strokeStartY = y
  session.lastDabX = x
  session.lastDabY = y
  session.totalTravel = 0
  session.hasDabbed = false
  session.hasAccum = false
  session.accumAlpha = 0
  session.distanceSinceSample = 0
  session.distanceSinceTransparentLoad = 0
  session.brushDiameter = 0
  session.started = true
}

const shouldSkipFingerDeadzone = (session: SmudgeStrokeSession, x: number, y: number): boolean => {
  if (session.inputKind !== SMUDGE_INPUT_FINGER || session.hasDabbed) return false
  const dx = x - session.strokeStartX
  const dy = y - session.strokeStartY
  const deadzone = FINGER_DEADZONE_PX * Params.pxScale
  return dx * dx + dy * dy < deadzone * deadzone
}

const brushHeight = (session: SmudgeStrokeSession): number =>
  clamp(
    Math.round(session.brushDiameter / clamp(session.brushAspect, 0.35, 2.5)),
    4,
    MAX_DIAMETER_PX
  )

const ensureScratchCanvases = (session: SmudgeStrokeSession): boolean => {
  const w = session.brushDiameter
  const h = brushHeight(session)
  session.accumCanvas = ensureCanvas(session.accumCanvas, w, h)
  session.stampCanvas = ensureCanvas(session.stampCanvas, w, h)
  session.workCanvas = ensureCanvas(session.workCanvas, w, h)
  session.maskCanvas = ensureCanvas(session.maskCanvas, w, h)
  session.sampleCanvas = ensureCanvas(session.sampleCanvas, SAMPLE_CANVAS_SIZE, SAMPLE_CANVAS_SIZE)
  session.tinySampleCanvas = ensureCanvas(
    session.tinySampleCanvas,
    SAMPLE_TINY_SIZE,
    SAMPLE_TINY_SIZE
  )
  if (
    !session.accumCanvas ||
    !session.stampCanvas ||
    !session.workCanvas ||
    !session.maskCanvas ||
    !session.sampleCanvas ||
    !session.tinySampleCanvas
  ) {
    return false
  }
  rebuildMask(session, w, h)
  return true
}

/** Copy the live layer region under (cx, cy) into a brush-sized canvas. */
const copyLivePatch = (
  source: HTMLCanvasElement,
  target: HTMLCanvasElement,
  cx: number,
  cy: number
) => {
  const targetCtx = target.getContext('2d')
  if (!targetCtx) return
  const w = target.width
  const h = target.height
  const x0 = Math.round(cx - w / 2)
  const y0 = Math.round(cy - h / 2)
  const sx = clamp(x0, 0, source.width)
  const sy = clamp(y0, 0, source.height)
  const sx2 = clamp(x0 + w, 0, source.width)
  const sy2 = clamp(y0 + h, 0, source.height)
  targetCtx.save()
  targetCtx.globalCompositeOperation = 'source-over'
  targetCtx.globalAlpha = 1
  targetCtx.clearRect(0, 0, w, h)
  if (sx2 > sx && sy2 > sy) {
    targetCtx.drawImage(source, sx, sy, sx2 - sx, sy2 - sy, sx - x0, sy - y0, sx2 - sx, sy2 - sy)
  }
  targetCtx.restore()
}

/** Centre-weighted average alpha under the brush, read from the live layer. */
const sampleLiveAlpha = (
  session: SmudgeStrokeSession,
  source: HTMLCanvasElement,
  cx: number,
  cy: number
): number | null => {
  const sampleCanvas = session.sampleCanvas!
  const tinyCanvas = session.tinySampleCanvas!
  const sampleCtx = sampleCanvas.getContext('2d')
  const tinyCtx = tinyCanvas.getContext('2d')
  if (!sampleCtx || !tinyCtx) return null

  const w = session.brushDiameter
  const h = brushHeight(session)
  const x0 = Math.round(cx - w / 2)
  const y0 = Math.round(cy - h / 2)
  const sx = clamp(x0, 0, source.width)
  const sy = clamp(y0, 0, source.height)
  const sx2 = clamp(x0 + w, 0, source.width)
  const sy2 = clamp(y0 + h, 0, source.height)

  sampleCtx.save()
  sampleCtx.globalCompositeOperation = 'source-over'
  sampleCtx.globalAlpha = 1
  sampleCtx.clearRect(0, 0, SAMPLE_CANVAS_SIZE, SAMPLE_CANVAS_SIZE)
  if (sx2 > sx && sy2 > sy) {
    sampleCtx.drawImage(
      source,
      sx,
      sy,
      sx2 - sx,
      sy2 - sy,
      ((sx - x0) / w) * SAMPLE_CANVAS_SIZE,
      ((sy - y0) / h) * SAMPLE_CANVAS_SIZE,
      ((sx2 - sx) / w) * SAMPLE_CANVAS_SIZE,
      ((sy2 - sy) / h) * SAMPLE_CANVAS_SIZE
    )
  }
  sampleCtx.restore()

  tinyCtx.save()
  tinyCtx.globalCompositeOperation = 'source-over'
  tinyCtx.globalAlpha = 1
  tinyCtx.clearRect(0, 0, SAMPLE_TINY_SIZE, SAMPLE_TINY_SIZE)
  tinyCtx.drawImage(sampleCanvas, 0, 0)
  tinyCtx.restore()

  let pixels: Uint8ClampedArray
  try {
    pixels = tinyCtx.getImageData(0, 0, SAMPLE_TINY_SIZE, SAMPLE_TINY_SIZE).data
  } catch {
    return null
  }
  let a = 0
  let weightSum = 0
  for (let p = 0; p < SAMPLE_TINY_SIZE * SAMPLE_TINY_SIZE; p++) {
    const nx = (((p % SAMPLE_TINY_SIZE) + 0.5) / SAMPLE_TINY_SIZE) * 2 - 1
    const ny = ((Math.floor(p / SAMPLE_TINY_SIZE) + 0.5) / SAMPLE_TINY_SIZE) * 2 - 1
    const falloff = clamp(1 - (nx * nx + ny * ny), 0, 1)
    const weight = 0.25 + 0.75 * falloff
    a += (pixels[p * 4 + 3] / 255) * weight
    weightSum += weight
  }
  return weightSum > 0 ? a / weightSum : 0
}

/**
 * Exchange paint between the accumulation buffer and the live patch in the
 * work canvas: Accum = (1 - pickup) * Accum + pickup * I, per pixel, in
 * premultiplied space. Canvas source-over alone cannot lower the buffer
 * alpha over transparent paint, so the buffer is first faded in proportion
 * to how transparent the live patch is estimated to be.
 */
const exchangeAccumWithLivePatch = (
  session: SmudgeStrokeSession,
  pickup: number,
  liveAlpha: number,
  force: boolean
) => {
  const accumCanvas = session.accumCanvas!
  const accumCtx = accumCanvas.getContext('2d')
  if (!accumCtx) return
  const w = accumCanvas.width
  const h = accumCanvas.height
  accumCtx.save()
  if (!session.hasAccum || force) {
    accumCtx.globalCompositeOperation = 'source-over'
    accumCtx.globalAlpha = 1
    accumCtx.clearRect(0, 0, w, h)
    accumCtx.drawImage(session.workCanvas!, 0, 0)
    session.hasAccum = true
    session.accumAlpha = liveAlpha
  } else {
    const fade = clamp(pickup * (1 - liveAlpha) * 1.6, 0, 0.7)
    if (fade > 0.003) {
      accumCtx.globalCompositeOperation = 'destination-out'
      accumCtx.globalAlpha = fade
      accumCtx.fillRect(0, 0, w, h)
    }
    accumCtx.globalCompositeOperation = 'source-over'
    accumCtx.globalAlpha = pickup
    accumCtx.drawImage(session.workCanvas!, 0, 0)
    session.accumAlpha = clamp(session.accumAlpha + (liveAlpha - session.accumAlpha) * pickup, 0, 1)
  }
  accumCtx.restore()
}

/** Stamp the accumulation buffer back onto the layer through the falloff mask. */
const stampAccum = (
  ctx: ExtendedCanvasContext,
  session: SmudgeStrokeSession,
  cx: number,
  cy: number,
  deposit: number
) => {
  const stampCanvas = session.stampCanvas!
  const stampCtx = stampCanvas.getContext('2d')
  if (!stampCtx) return
  const w = stampCanvas.width
  const h = stampCanvas.height
  stampCtx.save()
  stampCtx.globalCompositeOperation = 'source-over'
  stampCtx.globalAlpha = 1
  stampCtx.clearRect(0, 0, w, h)
  stampCtx.drawImage(session.accumCanvas!, 0, 0)
  stampCtx.globalCompositeOperation = 'destination-in'
  stampCtx.drawImage(session.maskCanvas!, 0, 0)
  stampCtx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = clamp(deposit, 0, 1)
  ctx.drawImage(stampCanvas, Math.round(cx - w / 2), Math.round(cy - h / 2))
  ctx.restore()
}

export const smudgeStrokeStep = (
  ctx: ExtendedCanvasContext,
  session: SmudgeStrokeSession,
  step: StrokeSample,
  phase: 'start' | 'move' | 'end',
  inputKind: SmudgeInputKind
): boolean => {
  if (phase === 'start') {
    beginSmudgeStroke(session, inputKind, step.x, step.y)
    session.brushDiameter = getStrokeDiameter(step.size, inputKind)
    session.brushAspect = step.aspectRatio ?? 1
    return false
  }

  if (!session.started) {
    beginSmudgeStroke(session, inputKind, step.oldX, step.oldY)
  }
  if (session.brushDiameter <= 0) {
    session.brushDiameter = getStrokeDiameter(step.size, session.inputKind)
    session.brushAspect = step.aspectRatio ?? 1
  }

  const prevX = step.oldX
  const prevY = step.oldY
  const curX = step.x
  const curY = step.y

  if (shouldSkipFingerDeadzone(session, curX, curY)) {
    return false
  }

  if (session.inputKind === SMUDGE_INPUT_PEN) {
    const minMove = PEN_MIN_MOVE_PX * Params.pxScale
    if (Math.hypot(curX - prevX, curY - prevY) < minMove && phase !== 'end') {
      return false
    }
  }

  if (!ensureScratchCanvases(session)) return false

  const strength = clamp(step.alpha, 0.02, 1)
  const params = getSmudgeDabParams(session.inputKind, strength, session.brushDiameter)
  const sourceCanvas = ctx.canvas

  let liveAlpha = session.accumAlpha

  // Load the brush with the paint under the starting point.
  if (!session.hasAccum) {
    copyLivePatch(sourceCanvas, session.workCanvas!, prevX, prevY)
    liveAlpha = sampleLiveAlpha(session, sourceCanvas, prevX, prevY) ?? 0
    exchangeAccumWithLivePatch(session, params.pickup, liveAlpha, true)
    session.lastDabX = prevX
    session.lastDabY = prevY
  }

  const fromX = session.lastDabX
  const fromY = session.lastDabY
  const dist = Math.hypot(curX - fromX, curY - fromY)
  if (dist < 0.5) return session.hasDabbed

  // Walk the segment in tiny overlapping dabs. Each dab exchanges the
  // buffer with the paint underneath and stamps it back at the new
  // position, so paint texture is physically displaced along the movement
  // by one dab spacing at a time - including transparency, which eats
  // into coloured areas from their boundary instead of colour leaking
  // out onto transparent areas.
  let spacing = Math.max(1.25, session.brushDiameter * params.spacingRatio)
  if (dist / spacing > MAX_DABS_PER_STEP) spacing = dist / MAX_DABS_PER_STEP
  const dabCount = Math.max(1, Math.ceil(dist / spacing))
  const dabTravel = dist / dabCount

  let did = false
  for (let i = 1; i <= dabCount; i++) {
    const t = i / dabCount
    const x = fromX + (curX - fromX) * t
    const y = fromY + (curY - fromY) * t
    session.totalTravel += dabTravel
    session.distanceSinceSample += dabTravel
    if (session.distanceSinceSample >= params.sampleIntervalPx) {
      session.distanceSinceSample = 0
      liveAlpha = sampleLiveAlpha(session, sourceCanvas, x, y) ?? liveAlpha
    }

    copyLivePatch(sourceCanvas, session.workCanvas!, x, y)
    exchangeAccumWithLivePatch(session, params.pickup, liveAlpha, false)

    // Where the buffer carries transparency, thin the existing paint
    // before stamping: this is what lets transparency creep into a
    // coloured area from its edge and feather it, instead of the colour
    // expanding outward. Expensive composite, so it is spaced out along
    // the path with accumulated strength (as before).
    const transparentLoad = Math.pow(1 - session.accumAlpha, 0.6)
    session.distanceSinceTransparentLoad = Math.min(
      session.distanceSinceTransparentLoad + dabTravel,
      params.transparentSpacingPx * 2.5
    )
    if (
      transparentLoad > 0.12 &&
      session.accumAlpha > 0.02 &&
      session.distanceSinceTransparentLoad >= params.transparentSpacingPx
    ) {
      const strengthScale = clamp(
        session.distanceSinceTransparentLoad / params.transparentSpacingPx,
        1,
        2.5
      )
      session.distanceSinceTransparentLoad = 0
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = clamp(params.dilute * transparentLoad * strengthScale, 0, 0.65)
      ctx.drawImage(
        session.maskCanvas!,
        Math.round(x - session.brushDiameter / 2),
        Math.round(y - brushHeight(session) / 2)
      )
      ctx.restore()
    }

    stampAccum(ctx, session, x, y, params.deposit)
    if (session.accumAlpha > 0.004 || liveAlpha > 0.004) did = true
    session.lastDabX = x
    session.lastDabY = y
  }

  if (did) session.hasDabbed = true
  return did
}

export const getSmudgeCursorSize = (size: number, touchType: string): number => {
  const kind = smudgeTouchTypeToInputKind(touchType)
  return getStrokeDiameter(size, kind)
}

export const getSmudgeCursorClassSuffix = (touchType: string): string =>
  touchType === TOUCH_TYPE_STYLUS ? 'pen' : 'finger'
