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

export type LassoPoint = [number, number]

export interface LassoSelectionOptions {
  inverted?: boolean
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

const traceLassoPolygon = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: LassoPoint[],
  closePath = true
) => {
  if (!points.length) return
  ctx.beginPath()
  appendLassoSubpath(ctx, points, closePath)
}

export const applyLassoClipPath = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: LassoPoint[],
  inverted = false
) => {
  if (points.length < MIN_POLYGON_POINTS) return
  ctx.beginPath()
  if (inverted && typeof ctx.rect === 'function' && ctx.canvas) {
    ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height)
    appendLassoSubpath(ctx, points, true)
    ctx.clip('evenodd')
  } else {
    appendLassoSubpath(ctx, points, true)
    ctx.clip('nonzero')
  }
}

const getPolygonClampedBounds = (
  points: LassoPoint[],
  canvasWidth: number,
  canvasHeight: number
): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
} | null => {
  if (points.length < MIN_POLYGON_POINTS) return null
  const curvePoints = getLassoBezierCurvePoints(points, true)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (let i = 0; i < curvePoints.length; i++) {
    const [x, y] = curvePoints[i]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  const clampedMinX = Math.max(0, Math.floor(minX))
  const clampedMinY = Math.max(0, Math.floor(minY))
  const clampedMaxX = Math.min(canvasWidth, Math.ceil(maxX))
  const clampedMaxY = Math.min(canvasHeight, Math.ceil(maxY))
  const width = clampedMaxX - clampedMinX
  const height = clampedMaxY - clampedMinY

  if (width < MIN_POLYGON_SPAN_PX || height < MIN_POLYGON_SPAN_PX) {
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

  if (inverted) {
    maskCtx.fillRect(0, 0, width, height)
    maskCtx.globalCompositeOperation = 'destination-out'
    traceLassoPolygon(maskCtx, points, true)
    maskCtx.fill()
    maskCtx.globalCompositeOperation = 'source-over'
  } else {
    traceLassoPolygon(maskCtx, points, true)
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

  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000000'
  if (inverted && typeof ctx.rect === 'function' && ctx.canvas) {
    ctx.beginPath()
    ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height)
    appendLassoSubpath(ctx, points, true)
    ctx.fill('evenodd')
  } else {
    traceLassoPolygon(ctx, points, true)
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

  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = compositeOperation
  ctx.fillStyle = color
  if (inverted && typeof ctx.rect === 'function' && ctx.canvas) {
    ctx.beginPath()
    ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height)
    appendLassoSubpath(ctx, points, true)
    ctx.fill('evenodd')
  } else {
    traceLassoPolygon(ctx, points, true)
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
  const polyBounds = getPolygonClampedBounds(points, sourceCanvas.width, sourceCanvas.height)
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
    hasPixels: true,
    inverted,
  }
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
  const unit = Math.max(0.5, Params.pxScale / Math.max(0.25, canvasScale || 1))
  const lineWidth = 1.8 * unit
  const dashLen = 6 * unit
  const gapLen = 5 * unit

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (inverted && typeof ctx.rect === 'function') {
    ctx.beginPath()
    ctx.rect(0, 0, canvas.width, canvas.height)
    appendLassoSubpath(ctx, points, true)
    ctx.fillStyle = 'rgba(2, 132, 199, 0.09)'
    ctx.fill('evenodd')
  } else {
    traceLassoPolygon(ctx, points, closed)
    ctx.fillStyle = closed ? 'rgba(2, 132, 199, 0.09)' : 'rgba(2, 132, 199, 0.05)'
    ctx.fill()
  }

  traceLassoPolygon(ctx, points, closed)

  ctx.lineWidth = lineWidth + 1.4 * unit
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.setLineDash([])
  ctx.stroke()

  ctx.lineWidth = lineWidth
  ctx.strokeStyle = '#0f172a'
  ctx.setLineDash([dashLen, gapLen])
  ctx.lineDashOffset = -dashOffset * unit
  ctx.stroke()

  if (inverted && typeof ctx.strokeRect === 'function') {
    const inset = lineWidth
    ctx.lineWidth = lineWidth + 1.2 * unit
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.setLineDash([])
    ctx.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2)

    ctx.lineWidth = lineWidth
    ctx.strokeStyle = '#0284c7'
    ctx.setLineDash([dashLen, gapLen])
    ctx.lineDashOffset = -dashOffset * unit
    ctx.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2)
  }

  if (!closed && points.length > 2) {
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

  ctx.restore()
}
