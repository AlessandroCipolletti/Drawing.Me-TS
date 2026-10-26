import Params from 'main/Params'
import { findImageContentCoords } from 'utils/imageUtils'
import {
  getDistanceBetweenThreePoints,
  getDistanceBetweenTwoPoints,
  getMiddlePointCoords,
  getPerc,
  getQuadraticBezierCurvePointAtTime,
  round,
} from 'utils/mathUtils'
import { floodFillMagicWandMask, traceMaskBoundaryRings } from 'utils/workers/magicWand'

export { floodFillMagicWandMask, traceMaskBoundaryRings }

export type LassoPoint = [number, number]

export interface LassoSelectionOptions {
  inverted?: boolean
  rings?: LassoPoint[][]
}

export interface LassoExtractionResult {
  selectedCanvas: HTMLCanvasElement
  outsideCanvas: HTMLCanvasElement
  maskCanvas: HTMLCanvasElement
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  points: LassoPoint[]
  rings?: LassoPoint[][]
  hasPixels: boolean
  inverted: boolean
}

const MIN_POINT_DISTANCE_PX = 4
const MIN_POLYGON_POINTS = 3
const MIN_POLYGON_SPAN_PX = 4
const BEZIER_SAMPLE_STEP_PX = 2.5
const MAX_SMOOTH_CLOSE_DISTANCE_PX = 28

const sampleQuadraticBezierSegment = (
  out: LassoPoint[],
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  stepPx: number
) => {
  const stepLength = getDistanceBetweenThreePoints(x1, y1, cx, cy, x2, y2, 1)
  if (!Number.isFinite(stepLength) || stepLength <= stepPx) {
    out.push([x2, y2])
    return
  }
  for (let d = stepPx; d < stepLength; d += stepPx) {
    const t = getPerc(d, stepLength) / 100
    out.push(getQuadraticBezierCurvePointAtTime(t, x1, y1, cx, cy, x2, y2, 1))
  }
  out.push([x2, y2])
}

export const getLassoBezierCurvePoints = (points: LassoPoint[], closePath = true): LassoPoint[] => {
  const n = points.length
  if (n < 3) {
    return points.map(([x, y]) => [round(x, 1), round(y, 1)])
  }

  const stepPx = Math.max(1.5, BEZIER_SAMPLE_STEP_PX * Params.pxScale)
  const first = points[0]
  const last = points[n - 1]
  const closeDist = getDistanceBetweenTwoPoints(last[0], last[1], first[0], first[1], 1)
  const smoothSeamlessLoop = closePath && closeDist <= MAX_SMOOTH_CLOSE_DISTANCE_PX * Params.pxScale

  if (smoothSeamlessLoop) {
    const [firstMidX, firstMidY] = getMiddlePointCoords(
      points[0][0],
      points[0][1],
      points[1][0],
      points[1][1],
      1
    )
    const curvePoints: LassoPoint[] = [[firstMidX, firstMidY]]
    let oldMidX = firstMidX
    let oldMidY = firstMidY

    for (let i = 1; i <= n; i++) {
      const [oldX, oldY] = points[i % n]
      const [nextX, nextY] = points[(i + 1) % n]
      const [midX, midY] = getMiddlePointCoords(oldX, oldY, nextX, nextY, 1)
      sampleQuadraticBezierSegment(curvePoints, oldMidX, oldMidY, oldX, oldY, midX, midY, stepPx)
      oldMidX = midX
      oldMidY = midY
    }
    return curvePoints
  }

  const [firstMidX, firstMidY] = getMiddlePointCoords(
    points[0][0],
    points[0][1],
    points[1][0],
    points[1][1],
    1
  )
  const curvePoints: LassoPoint[] = [[round(first[0], 1), round(first[1], 1)]]
  sampleQuadraticBezierSegment(
    curvePoints,
    first[0],
    first[1],
    first[0],
    first[1],
    firstMidX,
    firstMidY,
    stepPx
  )

  let oldMidX = firstMidX
  let oldMidY = firstMidY

  for (let i = 1; i < n - 1; i++) {
    const [oldX, oldY] = points[i]
    const [nextX, nextY] = points[i + 1]
    const [midX, midY] = getMiddlePointCoords(oldX, oldY, nextX, nextY, 1)
    sampleQuadraticBezierSegment(curvePoints, oldMidX, oldMidY, oldX, oldY, midX, midY, stepPx)
    oldMidX = midX
    oldMidY = midY
  }

  sampleQuadraticBezierSegment(
    curvePoints,
    oldMidX,
    oldMidY,
    last[0],
    last[1],
    last[0],
    last[1],
    stepPx
  )
  return curvePoints
}

const appendLassoSubpath = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: LassoPoint[],
  closePath = true
) => {
  if (!points.length) return
  const curvePoints = getLassoBezierCurvePoints(points, closePath)
  ctx.moveTo(curvePoints[0][0], curvePoints[0][1])
  for (let i = 1; i < curvePoints.length; i++) {
    ctx.lineTo(curvePoints[i][0], curvePoints[i][1])
  }
  if (closePath && curvePoints.length > 2) {
    ctx.closePath()
  }
}

const appendLassoLinearSubpath = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: LassoPoint[],
  closePath = true
) => {
  if (!points.length) return
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1])
  }
  if (closePath && points.length > 2) {
    ctx.closePath()
  }
}

const appendLassoRingSubpath = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: LassoPoint[],
  closePath: boolean,
  linear: boolean
) => {
  if (linear) {
    appendLassoLinearSubpath(ctx, points, closePath)
  } else {
    appendLassoSubpath(ctx, points, closePath)
  }
}

const traceLassoPolygon = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: LassoPoint[],
  closePath = true,
  linear = false
) => {
  if (!points.length) return
  ctx.beginPath()
  appendLassoRingSubpath(ctx, points, closePath, linear)
}

const getEffectiveRings = (points: LassoPoint[], rings?: LassoPoint[][]): LassoPoint[][] =>
  rings && rings.length > 0 ? rings : [points]

export const applyLassoClipPath = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: LassoPoint[],
  inverted = false,
  rings?: LassoPoint[][]
) => {
  if (points.length < MIN_POLYGON_POINTS) return
  const hasRings = Boolean(rings && rings.length > 0)
  const effectiveRings = getEffectiveRings(points, rings)
  ctx.beginPath()
  if (inverted && typeof ctx.rect === 'function' && ctx.canvas) {
    ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height)
  }
  for (const ring of effectiveRings) {
    if (ring.length >= MIN_POLYGON_POINTS) {
      appendLassoRingSubpath(ctx, ring, true, hasRings)
    }
  }
  if ((inverted && typeof ctx.rect === 'function' && ctx.canvas) || hasRings) {
    ctx.clip('evenodd')
  } else {
    ctx.clip('nonzero')
  }
}

const getPolygonClampedBounds = (
  points: LassoPoint[],
  canvasWidth: number,
  canvasHeight: number,
  minSpanPx = MIN_POLYGON_SPAN_PX,
  rings?: LassoPoint[][]
): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
} | null => {
  if (points.length < MIN_POLYGON_POINTS) return null
  const hasRings = Boolean(rings && rings.length > 0)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  if (hasRings && rings) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = ring[i]
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  } else {
    const curvePoints = getLassoBezierCurvePoints(points, true)
    for (let i = 0; i < curvePoints.length; i++) {
      const [x, y] = curvePoints[i]
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  const clampedMinX = Math.max(0, Math.floor(minX))
  const clampedMinY = Math.max(0, Math.floor(minY))
  const clampedMaxX = Math.min(canvasWidth, Math.ceil(maxX))
  const clampedMaxY = Math.min(canvasHeight, Math.ceil(maxY))
  const width = clampedMaxX - clampedMinX
  const height = clampedMaxY - clampedMinY

  if (width < minSpanPx || height < minSpanPx) {
    return null
  }

  return {
    minX: clampedMinX,
    minY: clampedMinY,
    maxX: clampedMaxX,
    maxY: clampedMaxY,
    width,
    height,
  }
}

const buildLassoMaskCanvas = (
  width: number,
  height: number,
  rawPoints: LassoPoint[],
  options?: LassoSelectionOptions
): HTMLCanvasElement => {
  const points: LassoPoint[] = rawPoints.map(([x, y]) => [round(x, 1), round(y, 1)])
  const hasRings = Boolean(options?.rings && options.rings.length > 0)
  const effectiveRings = getEffectiveRings(
    points,
    options?.rings?.map((ring) => ring.map(([x, y]) => [round(x, 1), round(y, 1)] as LassoPoint))
  )
  const inverted = Boolean(options?.inverted)

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = Math.max(1, width)
  maskCanvas.height = Math.max(1, height)
  const maskCtx = maskCanvas.getContext('2d')
  if (!maskCtx || points.length < MIN_POLYGON_POINTS) {
    return maskCanvas
  }

  maskCtx.save()
  maskCtx.globalAlpha = 1
  maskCtx.globalCompositeOperation = 'source-over'
  maskCtx.fillStyle = '#000000'

  if (hasRings && typeof maskCtx.rect === 'function') {
    maskCtx.beginPath()
    if (inverted) {
      maskCtx.rect(0, 0, width, height)
    }
    for (const ring of effectiveRings) {
      if (ring.length >= MIN_POLYGON_POINTS) {
        appendLassoLinearSubpath(maskCtx, ring, true)
      }
    }
    maskCtx.fill('evenodd')
  } else if (inverted) {
    maskCtx.fillRect(0, 0, width, height)
    maskCtx.globalCompositeOperation = 'destination-out'
    traceLassoPolygon(maskCtx, effectiveRings[0], true, hasRings)
    maskCtx.fill()
    maskCtx.globalCompositeOperation = 'source-over'
  } else {
    traceLassoPolygon(maskCtx, effectiveRings[0], true, hasRings)
    maskCtx.fill()
  }
  maskCtx.restore()

  return maskCanvas
}

export const appendLassoPointIfMoved = (points: LassoPoint[], x: number, y: number): boolean => {
  const rx = round(x, 1)
  const ry = round(y, 1)
  if (points.length === 0) {
    points.push([rx, ry])
    return true
  }
  const [lastX, lastY] = points[points.length - 1]
  const dx = rx - lastX
  const dy = ry - lastY
  const minDist = MIN_POINT_DISTANCE_PX * Params.pxScale
  if (dx * dx + dy * dy < minDist * minDist) {
    return false
  }
  points.push([rx, ry])
  return true
}

export const clearPolygonFromCanvas = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: LassoPoint[],
  options?: LassoSelectionOptions
) => {
  if (points.length < MIN_POLYGON_POINTS) return
  const inverted = Boolean(options?.inverted)
  const hasRings = Boolean(options?.rings && options.rings.length > 0)
  const effectiveRings = getEffectiveRings(points, options?.rings)

  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000000'
  if ((inverted && typeof ctx.rect === 'function' && ctx.canvas) || hasRings) {
    ctx.beginPath()
    if (inverted && typeof ctx.rect === 'function' && ctx.canvas) {
      ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height)
    }
    for (const ring of effectiveRings) {
      if (ring.length >= MIN_POLYGON_POINTS) {
        appendLassoRingSubpath(ctx, ring, true, hasRings)
      }
    }
    ctx.fill('evenodd')
  } else {
    traceLassoPolygon(ctx, points, true, false)
    ctx.fill()
  }
  ctx.restore()
}

export const fillPolygonOnCanvas = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: LassoPoint[],
  color: string,
  options?: LassoSelectionOptions,
  compositeOperation: GlobalCompositeOperation = 'source-over'
) => {
  if (points.length < MIN_POLYGON_POINTS || !color) return
  const inverted = Boolean(options?.inverted)
  const hasRings = Boolean(options?.rings && options.rings.length > 0)
  const effectiveRings = getEffectiveRings(points, options?.rings)

  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = compositeOperation
  ctx.fillStyle = color
  if ((inverted && typeof ctx.rect === 'function' && ctx.canvas) || hasRings) {
    ctx.beginPath()
    if (inverted && typeof ctx.rect === 'function' && ctx.canvas) {
      ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height)
    }
    for (const ring of effectiveRings) {
      if (ring.length >= MIN_POLYGON_POINTS) {
        appendLassoRingSubpath(ctx, ring, true, hasRings)
      }
    }
    ctx.fill('evenodd')
  } else {
    traceLassoPolygon(ctx, points, true, false)
    ctx.fill()
  }
  ctx.restore()
}

export const extractLassoSelection = async (
  sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
  rawPoints: LassoPoint[],
  visibleSourceCanvas: HTMLCanvasElement | OffscreenCanvas = sourceCanvas,
  options?: LassoSelectionOptions
): Promise<LassoExtractionResult | null> => {
  const points: LassoPoint[] = rawPoints.map(([x, y]) => [round(x, 1), round(y, 1)])
  const rings: LassoPoint[][] | undefined = options?.rings?.map((ring) =>
    ring.map(([x, y]) => [round(x, 1), round(y, 1)] as LassoPoint)
  )
  const polyBounds = getPolygonClampedBounds(
    points,
    sourceCanvas.width,
    sourceCanvas.height,
    rings ? 1 : MIN_POLYGON_SPAN_PX,
    rings
  )
  if (!polyBounds) return null

  const inverted = Boolean(options?.inverted)

  const searchMinX = inverted ? 0 : polyBounds.minX
  const searchMinY = inverted ? 0 : polyBounds.minY
  const searchMaxX = inverted ? sourceCanvas.width : polyBounds.maxX
  const searchMaxY = inverted ? sourceCanvas.height : polyBounds.maxY
  const searchW = Math.max(1, searchMaxX - searchMinX)
  const searchH = Math.max(1, searchMaxY - searchMinY)

  const maskCanvas = buildLassoMaskCanvas(sourceCanvas.width, sourceCanvas.height, points, {
    inverted,
    rings,
  })

  const maskedSubCanvas = document.createElement('canvas')
  maskedSubCanvas.width = searchW
  maskedSubCanvas.height = searchH
  const maskedSubCtx = maskedSubCanvas.getContext('2d', { willReadFrequently: true })
  if (!maskedSubCtx) {
    maskedSubCanvas.width = maskedSubCanvas.height = 0
    maskCanvas.width = maskCanvas.height = 0
    return null
  }

  maskedSubCtx.drawImage(
    visibleSourceCanvas,
    searchMinX,
    searchMinY,
    searchW,
    searchH,
    0,
    0,
    searchW,
    searchH
  )
  maskedSubCtx.globalCompositeOperation = 'destination-in'
  maskedSubCtx.drawImage(
    maskCanvas,
    searchMinX,
    searchMinY,
    searchW,
    searchH,
    0,
    0,
    searchW,
    searchH
  )
  maskedSubCtx.globalCompositeOperation = 'source-over'

  const contentCoords = await findImageContentCoords(maskedSubCanvas, 1)
  const hasPixels =
    Number.isFinite(contentCoords.minX) &&
    Number.isFinite(contentCoords.maxX) &&
    Number.isFinite(contentCoords.minY) &&
    Number.isFinite(contentCoords.maxY)

  const outsideCanvas = document.createElement('canvas')
  outsideCanvas.width = sourceCanvas.width
  outsideCanvas.height = sourceCanvas.height
  const outsideCtx = outsideCanvas.getContext('2d')
  if (outsideCtx) {
    outsideCtx.drawImage(sourceCanvas, 0, 0)
    outsideCtx.globalCompositeOperation = 'destination-out'
    outsideCtx.drawImage(maskCanvas, 0, 0)
    outsideCtx.globalCompositeOperation = 'source-over'
  }

  if (!hasPixels) {
    maskedSubCanvas.width = maskedSubCanvas.height = 0
    const emptySelectedCanvas = document.createElement('canvas')
    emptySelectedCanvas.width = 1
    emptySelectedCanvas.height = 1
    return {
      selectedCanvas: emptySelectedCanvas,
      outsideCanvas,
      maskCanvas,
      minX: polyBounds.minX,
      minY: polyBounds.minY,
      maxX: polyBounds.maxX,
      maxY: polyBounds.maxY,
      width: polyBounds.width,
      height: polyBounds.height,
      points,
      rings,
      hasPixels: false,
      inverted,
    }
  }

  const tightW = Math.max(1, round(contentCoords.maxX - contentCoords.minX, 0))
  const tightH = Math.max(1, round(contentCoords.maxY - contentCoords.minY, 0))
  const tightMinX = round(searchMinX + contentCoords.minX, 0)
  const tightMinY = round(searchMinY + contentCoords.minY, 0)
  const tightMaxX = tightMinX + tightW
  const tightMaxY = tightMinY + tightH

  const selectedCanvas = document.createElement('canvas')
  selectedCanvas.width = tightW
  selectedCanvas.height = tightH
  const selectedCtx = selectedCanvas.getContext('2d')
  if (selectedCtx) {
    selectedCtx.drawImage(
      maskedSubCanvas,
      contentCoords.minX,
      contentCoords.minY,
      tightW,
      tightH,
      0,
      0,
      tightW,
      tightH
    )
  }
  maskedSubCanvas.width = maskedSubCanvas.height = 0

  return {
    selectedCanvas,
    outsideCanvas,
    maskCanvas,
    minX: tightMinX,
    minY: tightMinY,
    maxX: tightMaxX,
    maxY: tightMaxY,
    width: tightW,
    height: tightH,
    points,
    rings,
    hasPixels: true,
    inverted,
  }
}

const MAX_LASSO_OVERLAY_RING_POINTS = 512

const decimateRingForOverlay = (
  ring: LassoPoint[],
  maxPoints = MAX_LASSO_OVERLAY_RING_POINTS
): LassoPoint[] => {
  if (ring.length <= maxPoints) return ring
  const out: LassoPoint[] = []
  const n = ring.length
  for (let i = 0; i < maxPoints; i++) {
    out.push(ring[Math.floor((i * n) / maxPoints)])
  }
  return out
}

const decimateRingsForOverlay = (rings: LassoPoint[][], linear: boolean): LassoPoint[][] =>
  rings.map((ring) => {
    const cap = linear
      ? MAX_LASSO_OVERLAY_RING_POINTS
      : Math.min(MAX_LASSO_OVERLAY_RING_POINTS, 320)
    return decimateRingForOverlay(ring, cap)
  })

const appendRingToPath2D = (
  path: Path2D,
  ring: LassoPoint[],
  closePath: boolean,
  linear: boolean
) => {
  if (ring.length < 2) return
  if (linear) {
    path.moveTo(ring[0][0], ring[0][1])
    for (let i = 1; i < ring.length; i++) {
      path.lineTo(ring[i][0], ring[i][1])
    }
    if (closePath && ring.length > 2) {
      path.closePath()
    }
    return
  }
  const curvePoints = getLassoBezierCurvePoints(ring, closePath)
  path.moveTo(curvePoints[0][0], curvePoints[0][1])
  for (let i = 1; i < curvePoints.length; i++) {
    path.lineTo(curvePoints[i][0], curvePoints[i][1])
  }
  if (closePath && curvePoints.length > 2) {
    path.closePath()
  }
}

type LassoOverlayAnimCache = {
  key: string
  staticCanvas: HTMLCanvasElement
  strokePath: Path2D
  inverted: boolean
  canvasWidth: number
  canvasHeight: number
}

let lassoOverlayAnimCache: LassoOverlayAnimCache | null = null

export const invalidateLassoOverlayRenderCache = () => {
  lassoOverlayAnimCache = null
}

const lassoOverlayGeometryKey = (
  canvas: HTMLCanvasElement,
  points: LassoPoint[],
  rings: LassoPoint[][] | undefined,
  inverted: boolean
): string => {
  let key = `${canvas.width}x${canvas.height}:${inverted}:${points.length}`
  if (rings?.length) {
    key += `:rings${rings.length}`
    for (let r = 0; r < rings.length && r < 4; r++) {
      const ring = rings[r]
      if (!ring.length) continue
      const a = ring[0]
      const b = ring[Math.floor(ring.length / 2)]
      const c = ring[ring.length - 1]
      key += `|${ring.length}:${a[0]},${a[1]},${b[0]},${b[1]},${c[0]},${c[1]}`
    }
  }
  return key
}

const paintLassoOverlayStaticLayer = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  points: LassoPoint[],
  closed: boolean,
  canvasScale: number,
  effectiveRings: LassoPoint[][],
  inverted: boolean,
  hasRings: boolean
) => {
  const unit = Math.max(0.5, Params.pxScale / Math.max(0.25, canvasScale || 1))
  const lineWidth = 1.8 * unit

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if ((inverted && typeof ctx.rect === 'function') || hasRings) {
    ctx.beginPath()
    if (inverted && typeof ctx.rect === 'function') {
      ctx.rect(0, 0, canvasWidth, canvasHeight)
    }
    for (const ring of effectiveRings) {
      if (ring.length >= 2) {
        appendLassoRingSubpath(ctx, ring, closed, hasRings)
      }
    }
    ctx.fillStyle = closed ? 'rgba(2, 132, 199, 0.09)' : 'rgba(2, 132, 199, 0.05)'
    ctx.fill('evenodd')
  } else {
    traceLassoPolygon(ctx, points, closed, false)
    ctx.fillStyle = closed ? 'rgba(2, 132, 199, 0.09)' : 'rgba(2, 132, 199, 0.05)'
    ctx.fill()
  }

  ctx.beginPath()
  for (const ring of effectiveRings) {
    if (ring.length >= 2) {
      appendLassoRingSubpath(ctx, ring, closed, hasRings)
    }
  }
  ctx.lineWidth = lineWidth + 1.4 * unit
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.setLineDash([])
  ctx.stroke()
  ctx.restore()
}

const ensureLassoOverlayAnimCache = (
  canvas: HTMLCanvasElement,
  points: LassoPoint[],
  closed: boolean,
  canvasScale: number,
  effectiveRings: LassoPoint[][],
  inverted: boolean,
  hasRings: boolean
) => {
  const key = lassoOverlayGeometryKey(canvas, points, effectiveRings, inverted)
  if (
    lassoOverlayAnimCache &&
    lassoOverlayAnimCache.key === key &&
    lassoOverlayAnimCache.canvasWidth === canvas.width &&
    lassoOverlayAnimCache.canvasHeight === canvas.height
  ) {
    return lassoOverlayAnimCache
  }

  const displayRings = decimateRingsForOverlay(effectiveRings, hasRings)
  const staticCanvas = document.createElement('canvas')
  staticCanvas.width = canvas.width
  staticCanvas.height = canvas.height
  const staticCtx = staticCanvas.getContext('2d')
  if (staticCtx) {
    paintLassoOverlayStaticLayer(
      staticCtx,
      canvas.width,
      canvas.height,
      points,
      closed,
      canvasScale,
      displayRings,
      inverted,
      hasRings
    )
  }

  const strokePath = new Path2D()
  for (const ring of displayRings) {
    appendRingToPath2D(strokePath, ring, closed, hasRings)
  }

  lassoOverlayAnimCache = {
    key,
    staticCanvas,
    strokePath,
    inverted,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  }
  return lassoOverlayAnimCache
}

const paintLassoOverlayOpenStroke = (
  ctx: CanvasRenderingContext2D,
  points: LassoPoint[],
  canvasScale: number
) => {
  if (points.length <= 2) return
  const unit = Math.max(0.5, Params.pxScale / Math.max(0.25, canvasScale || 1))
  const first = points[0]
  const last = points[points.length - 1]
  ctx.beginPath()
  ctx.moveTo(last[0], last[1])
  ctx.lineTo(first[0], first[1])
  ctx.lineWidth = 1.2 * unit
  ctx.strokeStyle = 'rgba(2, 132, 199, 0.55)'
  ctx.setLineDash([3 * unit, 4 * unit])
  ctx.lineDashOffset = 0
  ctx.stroke()
}

export const renderLassoOverlayFrame = (
  canvas: HTMLCanvasElement | null,
  points: LassoPoint[],
  closed: boolean,
  canvasScale: number,
  dashOffset = 0,
  options?: LassoSelectionOptions
) => {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (points.length < 2) return

  const inverted = Boolean(closed && options?.inverted)
  const hasRings = Boolean(closed && options?.rings && options.rings.length > 0)
  const effectiveRings = closed ? getEffectiveRings(points, options?.rings) : [points]
  const unit = Math.max(0.5, Params.pxScale / Math.max(0.25, canvasScale || 1))
  const lineWidth = 1.8 * unit
  const dashLen = 6 * unit
  const gapLen = 5 * unit

  if (closed) {
    const cache = ensureLassoOverlayAnimCache(
      canvas,
      points,
      closed,
      canvasScale,
      effectiveRings,
      inverted,
      hasRings
    )
    ctx.drawImage(cache.staticCanvas, 0, 0)
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = '#0f172a'
    ctx.setLineDash([dashLen, gapLen])
    ctx.lineDashOffset = -dashOffset * unit
    ctx.stroke(cache.strokePath)

    if (cache.inverted && typeof ctx.strokeRect === 'function') {
      const inset = lineWidth
      ctx.lineWidth = lineWidth
      ctx.strokeStyle = '#0284c7'
      ctx.setLineDash([dashLen, gapLen])
      ctx.lineDashOffset = -dashOffset * unit
      ctx.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2)
    }
    ctx.restore()
    return
  }

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  paintLassoOverlayStaticLayer(
    ctx,
    canvas.width,
    canvas.height,
    points,
    closed,
    canvasScale,
    effectiveRings,
    inverted,
    hasRings
  )
  ctx.beginPath()
  for (const ring of effectiveRings) {
    if (ring.length >= 2) {
      appendLassoRingSubpath(ctx, ring, closed, hasRings)
    }
  }
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = '#0f172a'
  ctx.setLineDash([dashLen, gapLen])
  ctx.lineDashOffset = -dashOffset * unit
  ctx.stroke()
  paintLassoOverlayOpenStroke(ctx, points, canvasScale)
  ctx.restore()
}

export const drawMagicWandToleranceCircle = (
  canvas: HTMLCanvasElement | null,
  x: number,
  y: number,
  radius: number,
  canvasScale: number
) => {
  if (!canvas || radius <= 0) return
  const ctx = canvas.getContext('2d')
  if (!ctx || typeof ctx.arc !== 'function') return
  const unit = Math.max(0.5, Params.pxScale / Math.max(0.25, canvasScale || 1))
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(2, 132, 199, 0.14)'
  ctx.fill()
  ctx.lineWidth = unit
  ctx.strokeStyle = '#0f172a'
  ctx.setLineDash([])
  ctx.stroke()
  ctx.restore()
}

const MAX_WAND_WORK_DIMENSION = 1400
const BUCKET_TOLERANCE_WITH_TRANSPARENCY = 24
const BUCKET_TOLERANCE_WITHOUT_TRANSPARENCY = 4

export interface MagicWandUpdatePayload {
  points: LassoPoint[]
  rings: LassoPoint[][]
  tolerance: number
}

export interface MagicWandSession {
  sessionId: number
  workW: number
  workH: number
  scaleX: number
  scaleY: number
  seedGx: number
  seedGy: number
  baseTolerance: number
  useWorker: boolean
  rgba: Uint8ClampedArray | null
  mask: Uint8Array | null
  queue: Int32Array | null
  visitedEdges: Uint8Array | null
  lastTolerance: number
  inFlight: boolean
  pendingTolerance: number | null
  cancelled: boolean
  points: LassoPoint[]
  rings: LassoPoint[][]
  onUpdate?: (payload: MagicWandUpdatePayload) => void
  idleResolvers: Array<() => void>
}

let magicWandWorker: Worker | null = null
let activeWorkerWandSession: MagicWandSession | null = null
let nextMagicWandSessionId = 0

const startWorkerWandCompute = (session: MagicWandSession, tolerance: number) => {
  if (!magicWandWorker || session.cancelled) return
  session.inFlight = true
  session.pendingTolerance = null
  magicWandWorker.postMessage({
    type: 'compute',
    sessionId: session.sessionId,
    tolerance,
  })
}

const getMagicWandWorker = (): Worker | null => {
  if (typeof Worker === 'undefined') return null
  if (!magicWandWorker) {
    magicWandWorker = new Worker(
      new URL('../../../../utils/workers/magicWand.ts', import.meta.url),
      {
        type: 'module',
      }
    )
    magicWandWorker.addEventListener('message', (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data.sessionId !== 'number') return
      const session = activeWorkerWandSession
      if (!session || session.cancelled || session.sessionId !== data.sessionId) return

      session.lastTolerance = data.tolerance
      session.points = data.points || []
      session.rings = data.rings || []
      session.inFlight = false

      session.onUpdate?.({
        points: session.points,
        rings: session.rings,
        tolerance: session.lastTolerance,
      })

      if (session.cancelled || activeWorkerWandSession !== session) {
        while (session.idleResolvers.length > 0) {
          session.idleResolvers.shift()!()
        }
        return
      }

      if (session.pendingTolerance !== null && session.pendingTolerance !== session.lastTolerance) {
        const nextTol = session.pendingTolerance
        session.pendingTolerance = null
        startWorkerWandCompute(session, nextTol)
      } else {
        session.pendingTolerance = null
        while (session.idleResolvers.length > 0) {
          session.idleResolvers.shift()!()
        }
      }
    })
  }
  return magicWandWorker
}

const computeSyncMagicWandSession = (
  session: MagicWandSession,
  tolerance: number
): { points: LassoPoint[]; rings: LassoPoint[][] } => {
  if (!session.rgba || !session.mask || !session.queue || !session.visitedEdges) {
    return { points: session.points, rings: session.rings }
  }
  const clampedTol = Math.max(0, Math.min(255, Math.round(tolerance)))
  if (clampedTol === session.lastTolerance && session.points.length >= 3) {
    return { points: session.points, rings: session.rings }
  }
  session.lastTolerance = clampedTol
  const effectiveTolerance = Math.min(255, session.baseTolerance + clampedTol)

  const bounds = floodFillMagicWandMask(
    session.rgba,
    session.workW,
    session.workH,
    session.seedGx,
    session.seedGy,
    effectiveTolerance,
    true,
    session.mask,
    session.queue
  )

  const rings = traceMaskBoundaryRings(
    session.mask,
    session.workW,
    session.workH,
    bounds,
    session.scaleX,
    session.scaleY,
    session.visitedEdges
  )

  session.rings = rings
  session.points = rings[0] || []
  return { points: session.points, rings: session.rings }
}

export const createMagicWandSession = (
  sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
  seedX: number,
  seedY: number,
  onUpdate?: (payload: MagicWandUpdatePayload) => void
): MagicWandSession | null => {
  const fullW = sourceCanvas.width
  const fullH = sourceCanvas.height
  if (fullW <= 0 || fullH <= 0) return null

  const downscale = Math.max(1, Math.max(fullW, fullH) / MAX_WAND_WORK_DIMENSION)
  const workW = Math.max(1, Math.round(fullW / downscale))
  const workH = Math.max(1, Math.round(fullH / downscale))
  const scaleX = fullW / workW
  const scaleY = fullH / workH

  const workCanvas = document.createElement('canvas')
  workCanvas.width = workW
  workCanvas.height = workH
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true })
  if (!workCtx) {
    workCanvas.width = workCanvas.height = 0
    return null
  }
  workCtx.imageSmoothingEnabled = false
  workCtx.drawImage(sourceCanvas, 0, 0, workW, workH)
  const imageData = workCtx.getImageData(0, 0, workW, workH)
  workCanvas.width = workCanvas.height = 0

  const seedGx = Math.max(0, Math.min(workW - 1, Math.floor(seedX / scaleX)))
  const seedGy = Math.max(0, Math.min(workH - 1, Math.floor(seedY / scaleY)))
  const seedOffset = (seedGy * workW + seedGx) * 4
  const tr = imageData.data[seedOffset]
  const tg = imageData.data[seedOffset + 1]
  const tb = imageData.data[seedOffset + 2]
  const ta = imageData.data[seedOffset + 3]
  const baseTolerance =
    ta < 255 && tr + tg + tb > 0
      ? BUCKET_TOLERANCE_WITH_TRANSPARENCY
      : BUCKET_TOLERANCE_WITHOUT_TRANSPARENCY

  const worker = getMagicWandWorker()
  const sessionId = ++nextMagicWandSessionId

  if (worker) {
    const session: MagicWandSession = {
      sessionId,
      workW,
      workH,
      scaleX,
      scaleY,
      seedGx,
      seedGy,
      baseTolerance,
      useWorker: true,
      rgba: null,
      mask: null,
      queue: null,
      visitedEdges: null,
      lastTolerance: -1,
      inFlight: true,
      pendingTolerance: null,
      cancelled: false,
      points: [],
      rings: [],
      onUpdate,
      idleResolvers: [],
    }
    activeWorkerWandSession = session
    worker.postMessage(
      {
        type: 'init',
        sessionId,
        workW,
        workH,
        scaleX,
        scaleY,
        seedGx,
        seedGy,
        baseTolerance,
        rgba: imageData.data,
        tolerance: 0,
      },
      [imageData.data.buffer]
    )
    return session
  }

  const pixelCount = workW * workH
  const session: MagicWandSession = {
    sessionId,
    workW,
    workH,
    scaleX,
    scaleY,
    seedGx,
    seedGy,
    baseTolerance,
    useWorker: false,
    rgba: imageData.data,
    mask: new Uint8Array(pixelCount),
    queue: new Int32Array(pixelCount),
    visitedEdges: new Uint8Array((workW + 1) * (workH + 1)),
    lastTolerance: -1,
    inFlight: false,
    pendingTolerance: null,
    cancelled: false,
    points: [],
    rings: [],
    onUpdate,
    idleResolvers: [],
  }

  computeSyncMagicWandSession(session, 0)
  session.onUpdate?.({
    points: session.points,
    rings: session.rings,
    tolerance: 0,
  })
  return session
}

export const requestMagicWandSessionTolerance = (session: MagicWandSession, tolerance: number) => {
  if (session.cancelled) return
  const clampedTol = Math.max(0, Math.min(255, Math.round(tolerance)))
  if (session.useWorker) {
    if (session.inFlight) {
      session.pendingTolerance = clampedTol
      return
    }
    if (clampedTol === session.lastTolerance && session.points.length >= 3) {
      return
    }
    startWorkerWandCompute(session, clampedTol)
    return
  }

  const prevTol = session.lastTolerance
  const res = computeSyncMagicWandSession(session, clampedTol)
  if (clampedTol !== prevTol) {
    session.onUpdate?.({
      points: res.points,
      rings: res.rings,
      tolerance: clampedTol,
    })
  }
}

export const cancelMagicWandSession = (session: MagicWandSession | null) => {
  if (!session) return
  session.cancelled = true
  session.pendingTolerance = null
  session.onUpdate = undefined
  if (activeWorkerWandSession === session) {
    activeWorkerWandSession = null
  }
  if (session.useWorker && magicWandWorker) {
    magicWandWorker.postMessage({
      type: 'clear',
      sessionId: session.sessionId,
    })
  }
  while (session.idleResolvers.length > 0) {
    session.idleResolvers.shift()!()
  }
}

export const completeMagicWandSession = async (
  session: MagicWandSession,
  tolerance: number
): Promise<{ points: LassoPoint[]; rings: LassoPoint[][] }> => {
  const clampedTol = Math.max(0, Math.min(255, Math.round(tolerance)))
  session.onUpdate = undefined
  if (session.useWorker) {
    if (session.inFlight) {
      session.pendingTolerance = clampedTol
      await new Promise<void>((resolve) => {
        session.idleResolvers.push(resolve)
      })
    } else if (clampedTol !== session.lastTolerance) {
      startWorkerWandCompute(session, clampedTol)
      await new Promise<void>((resolve) => {
        session.idleResolvers.push(resolve)
      })
    }
    const res = { points: session.points, rings: session.rings }
    cancelMagicWandSession(session)
    return res
  }

  const res = computeSyncMagicWandSession(session, clampedTol)
  cancelMagicWandSession(session)
  return res
}
