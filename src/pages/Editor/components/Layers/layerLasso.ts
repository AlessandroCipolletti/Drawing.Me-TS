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

export interface LassoExtractionResult {
  selectedCanvas: HTMLCanvasElement
  outsideCanvas: HTMLCanvasElement
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  points: LassoPoint[]
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

const traceLassoPolygon = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: LassoPoint[],
  closePath = true
) => {
  if (!points.length) return
  const curvePoints = getLassoBezierCurvePoints(points, closePath)
  ctx.beginPath()
  ctx.moveTo(curvePoints[0][0], curvePoints[0][1])
  for (let i = 1; i < curvePoints.length; i++) {
    ctx.lineTo(curvePoints[i][0], curvePoints[i][1])
  }
  if (closePath && curvePoints.length > 2) {
    ctx.closePath()
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
  points: LassoPoint[]
) => {
  if (points.length < MIN_POLYGON_POINTS) return
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000000'
  traceLassoPolygon(ctx, points, true)
  ctx.fill()
  ctx.restore()
}

export const extractLassoSelection = async (
  sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
  rawPoints: LassoPoint[]
): Promise<LassoExtractionResult | null> => {
  const points: LassoPoint[] = rawPoints.map(([x, y]) => [round(x, 1), round(y, 1)])
  const polyBounds = getPolygonClampedBounds(points, sourceCanvas.width, sourceCanvas.height)
  if (!polyBounds) return null

  const { minX: polyMinX, minY: polyMinY, width: polyW, height: polyH } = polyBounds

  const maskedSubCanvas = document.createElement('canvas')
  maskedSubCanvas.width = polyW
  maskedSubCanvas.height = polyH
  const maskedSubCtx = maskedSubCanvas.getContext('2d', { willReadFrequently: true })
  if (!maskedSubCtx) {
    maskedSubCanvas.width = maskedSubCanvas.height = 0
    return null
  }

  maskedSubCtx.save()
  maskedSubCtx.translate(-polyMinX, -polyMinY)
  maskedSubCtx.fillStyle = '#000000'
  traceLassoPolygon(maskedSubCtx, points, true)
  maskedSubCtx.fill()
  maskedSubCtx.globalCompositeOperation = 'source-in'
  maskedSubCtx.drawImage(
    sourceCanvas,
    polyMinX,
    polyMinY,
    polyW,
    polyH,
    polyMinX,
    polyMinY,
    polyW,
    polyH
  )
  maskedSubCtx.restore()

  const contentCoords = await findImageContentCoords(maskedSubCanvas, 1)
  if (!Number.isFinite(contentCoords.minX) || !Number.isFinite(contentCoords.maxX)) {
    maskedSubCanvas.width = maskedSubCanvas.height = 0
    return null
  }

  const tightW = Math.max(1, round(contentCoords.maxX - contentCoords.minX, 0))
  const tightH = Math.max(1, round(contentCoords.maxY - contentCoords.minY, 0))
  const tightMinX = round(polyMinX + contentCoords.minX, 0)
  const tightMinY = round(polyMinY + contentCoords.minY, 0)
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

  const outsideCanvas = document.createElement('canvas')
  outsideCanvas.width = sourceCanvas.width
  outsideCanvas.height = sourceCanvas.height
  const outsideCtx = outsideCanvas.getContext('2d')
  if (outsideCtx) {
    outsideCtx.drawImage(sourceCanvas, 0, 0)
    clearPolygonFromCanvas(outsideCtx, points)
  }

  return {
    selectedCanvas,
    outsideCanvas,
    minX: tightMinX,
    minY: tightMinY,
    maxX: tightMaxX,
    maxY: tightMaxY,
    width: tightW,
    height: tightH,
    points,
  }
}

export const renderLassoOverlayFrame = (
  canvas: HTMLCanvasElement | null,
  points: LassoPoint[],
  closed: boolean,
  canvasScale: number,
  dashOffset = 0
) => {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (points.length < 2) return

  const unit = Math.max(0.5, Params.pxScale / Math.max(0.25, canvasScale || 1))
  const lineWidth = 1.8 * unit
  const dashLen = 6 * unit
  const gapLen = 5 * unit

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  traceLassoPolygon(ctx, points, closed)
  ctx.fillStyle = closed ? 'rgba(2, 132, 199, 0.09)' : 'rgba(2, 132, 199, 0.05)'
  ctx.fill()

  ctx.lineWidth = lineWidth + 1.4 * unit
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.setLineDash([])
  ctx.stroke()

  ctx.lineWidth = lineWidth
  ctx.strokeStyle = '#0f172a'
  ctx.setLineDash([dashLen, gapLen])
  ctx.lineDashOffset = -dashOffset * unit
  ctx.stroke()

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
