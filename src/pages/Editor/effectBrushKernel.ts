import { ExtendedCanvasContext, StrokeSample } from 'utils/canvasUtils'
import {
  applyEffectBrushToImageData,
  buildDabWeights,
  clampSignedIntensity,
  EffectBrushKind,
  getEffectiveIntensity,
} from './effectBrushFilters'

const MAX_DIAMETER_PX = 384
const MAX_DABS_PER_STEP = 40
/** Default per-call time budget; the remainder is painted on the next move. */
const EFFECT_DAB_BUDGET_MS = 6

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export interface EffectBrushStrokeSession {
  started: boolean
  kind: EffectBrushKind
  baseIntensity: number
  brushDiameter: number
  lastDabX: number
  lastDabY: number
  targetX: number
  targetY: number
  hasDabbed: boolean
  workCanvas: HTMLCanvasElement | null
  stampCanvas: HTMLCanvasElement | null
  maskCanvas: HTMLCanvasElement | null
  workCtx: CanvasRenderingContext2D | null
  stampCtx: CanvasRenderingContext2D | null
  maskCtx: CanvasRenderingContext2D | null
  weights: Float32Array | null
  weightsKey: number
  /** Adaptive safety valve: temporarily widens dab spacing under load. */
  spacingScale: number
}

export const createEffectBrushStrokeSession = (): EffectBrushStrokeSession => ({
  started: false,
  kind: 'saturation',
  baseIntensity: 10,
  brushDiameter: 0,
  lastDabX: 0,
  lastDabY: 0,
  targetX: 0,
  targetY: 0,
  hasDabbed: false,
  workCanvas: null,
  stampCanvas: null,
  maskCanvas: null,
  workCtx: null,
  stampCtx: null,
  maskCtx: null,
  weights: null,
  weightsKey: -1,
  spacingScale: 1,
})

export const resetEffectBrushStrokeSession = (session: EffectBrushStrokeSession) => {
  session.started = false
  session.brushDiameter = 0
  session.hasDabbed = false
  session.workCanvas = null
  session.stampCanvas = null
  session.maskCanvas = null
  session.workCtx = null
  session.stampCtx = null
  session.maskCtx = null
  session.weights = null
  session.weightsKey = -1
  session.spacingScale = 1
}

const createCanvas = (): HTMLCanvasElement | null =>
  typeof document === 'undefined' ? null : document.createElement('canvas')

const ensureCanvas = (
  existing: HTMLCanvasElement | null,
  size: number
): HTMLCanvasElement | null => {
  const canvas = existing ?? createCanvas()
  if (!canvas) return null
  if (canvas.width !== size) canvas.width = size
  if (canvas.height !== size) canvas.height = size
  return canvas
}

const applyDab = (
  ctx: ExtendedCanvasContext,
  session: EffectBrushStrokeSession,
  cx: number,
  cy: number,
  intensity: number
): boolean => {
  const diameter = session.brushDiameter
  if (diameter <= 0 || intensity === 0) return false
  // The sharpen/blur kernels sample neighbours up to ~16px outside the dab;
  // the ROI margin must cover that or the effect would clip at the circle.
  const margin = session.kind === 'sharpen' ? clamp(Math.round(diameter * 0.2), 16, 26) : 2
  const roiSize = diameter + margin * 2
  session.workCanvas = ensureCanvas(session.workCanvas, roiSize)
  session.stampCanvas = ensureCanvas(session.stampCanvas, roiSize)
  session.maskCanvas = ensureCanvas(session.maskCanvas, roiSize)
  if (!session.workCanvas || !session.stampCanvas || !session.maskCanvas) return false
  if (!session.workCtx) {
    session.workCtx = session.workCanvas.getContext('2d', { willReadFrequently: true })
  }
  if (!session.stampCtx) {
    session.stampCtx = session.stampCanvas.getContext('2d')
  }
  if (!session.maskCtx) {
    session.maskCtx = session.maskCanvas.getContext('2d')
  }
  const workCtx = session.workCtx
  const stampCtx = session.stampCtx
  const maskCtx = session.maskCtx
  if (!workCtx || !stampCtx || !maskCtx) return false

  const x0 = Math.round(cx - roiSize / 2)
  const y0 = Math.round(cy - roiSize / 2)
  const source = ctx.canvas
  workCtx.save()
  workCtx.globalCompositeOperation = 'source-over'
  workCtx.globalAlpha = 1
  workCtx.clearRect(0, 0, roiSize, roiSize)
  const sx = clamp(x0, 0, source.width)
  const sy = clamp(y0, 0, source.height)
  const sx2 = clamp(x0 + roiSize, 0, source.width)
  const sy2 = clamp(y0 + roiSize, 0, source.height)
  if (sx2 <= sx || sy2 <= sy) {
    workCtx.restore()
    return false
  }
  workCtx.drawImage(source, sx, sy, sx2 - sx, sy2 - sy, sx - x0, sy - y0, sx2 - sx, sy2 - sy)
  workCtx.restore()

  let imageData: ImageData
  try {
    imageData = workCtx.getImageData(0, 0, roiSize, roiSize)
  } catch {
    return false
  }
  const key = roiSize * 10000 + diameter
  if (session.weightsKey !== key) {
    session.weights = buildDabWeights(roiSize, diameter / 2, session.weights ?? undefined)
    session.weightsKey = key
    // Circular alpha mask matching the brush cursor exactly: the stamp is
    // clipped by it, so nothing outside the circle is ever composited.
    const maskData = maskCtx.createImageData(roiSize, roiSize)
    for (let p = 0; p < roiSize * roiSize; p++) {
      const o = p * 4
      maskData.data[o] = 255
      maskData.data[o + 1] = 255
      maskData.data[o + 2] = 255
      maskData.data[o + 3] = Math.round(session.weights[p] * 255)
    }
    maskCtx.putImageData(maskData, 0, 0)
  }
  // Fully filtered ROI; the circular mask below performs the falloff blend
  // when compositing, instead of pre-blending inside a square stamp (which
  // recomposited semi-transparent pixels outside the circle and darkened
  // them into a visible square).
  applyEffectBrushToImageData(imageData, session.kind, intensity, null)

  stampCtx.save()
  stampCtx.globalCompositeOperation = 'source-over'
  stampCtx.globalAlpha = 1
  stampCtx.clearRect(0, 0, roiSize, roiSize)
  stampCtx.putImageData(imageData, 0, 0)
  stampCtx.globalCompositeOperation = 'destination-in'
  stampCtx.globalAlpha = 1
  stampCtx.drawImage(session.maskCanvas, 0, 0)
  stampCtx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.drawImage(session.stampCanvas, x0, y0)
  ctx.restore()
  return true
}

/**
 * Paint effect dabs along the segment from the last dab to the sample point.
 * Stops after `budgetMs`; unpainted distance stays pending because
 * `lastDabX/lastDabY` only advance as far as was actually painted, so the
 * next sample (or the end-of-stroke flush with an infinite budget) completes
 * the segment. Nothing is ever skipped.
 */
export const effectBrushStrokeStep = (
  ctx: ExtendedCanvasContext,
  session: EffectBrushStrokeSession,
  step: StrokeSample,
  phase: 'start' | 'move' | 'end',
  kind: EffectBrushKind,
  baseIntensity: number,
  budgetMs = EFFECT_DAB_BUDGET_MS
): boolean => {
  if (phase === 'start') {
    session.started = true
    session.kind = kind
    session.baseIntensity = clampSignedIntensity(baseIntensity)
    session.brushDiameter = clamp(Math.round(step.size || 0), 4, MAX_DIAMETER_PX)
    session.lastDabX = step.x
    session.lastDabY = step.y
    session.targetX = step.x
    session.targetY = step.y
    session.hasDabbed = false
    session.spacingScale = 1
    const startIntensity = getEffectiveIntensity(session.baseIntensity, step.force)
    if (startIntensity === 0) return false
    const did = applyDab(ctx, session, step.x, step.y, startIntensity)
    if (did) session.hasDabbed = true
    return did
  }
  session.targetX = step.x
  session.targetY = step.y
  if (!session.started) {
    session.started = true
    session.kind = kind
    session.baseIntensity = clampSignedIntensity(baseIntensity)
    session.brushDiameter = clamp(Math.round(step.size || 0), 4, MAX_DIAMETER_PX)
    session.lastDabX = step.oldX
    session.lastDabY = step.oldY
  }
  const intensity = getEffectiveIntensity(session.baseIntensity, step.force)
  if (intensity === 0 || session.brushDiameter <= 0) return session.hasDabbed

  // A single tap (start + end, no move) still applies one dab.
  if (phase === 'end' && !session.hasDabbed) {
    const did = applyDab(ctx, session, step.x, step.y, intensity)
    if (did) {
      session.hasDabbed = true
      session.lastDabX = step.x
      session.lastDabY = step.y
    }
    return did
  }

  // Walk the same quadratic Bezier the colour stamps use — from the previous
  // mid-point, through the previous point as control, to this mid-point (or
  // to the final point at stroke end) — stamping a dab every `spacing` px of
  // travel from the last dab actually painted.
  const startX = step.oldMidX ?? step.oldX
  const startY = step.oldMidY ?? step.oldY
  const controlX = step.oldX
  const controlY = step.oldY
  const endX = phase === 'end' ? step.x : (step.midX ?? step.x)
  const endY = phase === 'end' ? step.y : (step.midY ?? step.y)
  const approxLength =
    Math.hypot(controlX - startX, controlY - startY) + Math.hypot(endX - controlX, endY - controlY)
  if (approxLength < 0.5) return session.hasDabbed

  const startedAt = typeof performance !== 'undefined' ? performance.now() : 0
  const spacing = clamp(session.brushDiameter * 0.2 * session.spacingScale, 1.5, 96)
  const sampleCount = clamp(Math.ceil(approxLength / Math.max(1, spacing / 2)), 8, 160)

  let did = false
  let painted = 0
  let exhausted = false
  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount
    const mt = 1 - t
    const x = mt * mt * startX + 2 * mt * t * controlX + t * t * endX
    const y = mt * mt * startY + 2 * mt * t * controlY + t * t * endY
    if (Math.hypot(x - session.lastDabX, y - session.lastDabY) < spacing) continue
    if (painted >= MAX_DABS_PER_STEP) {
      exhausted = true
      break
    }
    if (applyDab(ctx, session, x, y, intensity)) {
      did = true
      painted++
      session.lastDabX = x
      session.lastDabY = y
    }
    if (
      budgetMs !== Infinity &&
      painted > 0 &&
      painted % 4 === 0 &&
      typeof performance !== 'undefined' &&
      performance.now() - startedAt > budgetMs
    ) {
      // Fell behind: widen spacing briefly so the stroke can catch up. The
      // unpainted curve stays pending — lastDab only advanced this far.
      session.spacingScale = clamp(session.spacingScale * 1.35, 1, 2.5)
      exhausted = true
      break
    }
  }
  if (!exhausted) session.spacingScale = clamp(session.spacingScale * 0.8, 1, 2.5)
  if (did) session.hasDabbed = true
  return did
}

/** True when a previous move could not finish its segment within budget. */
export const hasPendingEffectDab = (session: EffectBrushStrokeSession): boolean =>
  session.started &&
  Math.hypot(session.targetX - session.lastDabX, session.targetY - session.lastDabY) > 0.5
