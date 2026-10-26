import Params from 'main/Params'
import { StrokeSample } from 'utils/canvasUtils'
import {
  convertAngleDegToRad,
  getAngleRadBetweenTwoPoints,
  getDistanceBetweenTwoPoints,
  getNumberInBetween,
  round,
} from 'utils/mathUtils'
import { StepToolParams } from './editorStepMath'

export type QuickShapeVariant =
  | 'line'
  | 'arc'
  | 'polyline'
  | 'ellipse'
  | 'circle'
  | 'triangle'
  | 'equilateral'
  | 'rect'
  | 'square'
  | 'quad'
  | 'pentagon'
  | 'regularPentagon'
  | 'hexagon'
  | 'regularHexagon'
  | 'freehand'

export interface QuickShapeInputPoint {
  x: number
  y: number
  size: number
  alpha: number
  rotation: number
  aspectRatio: number
}

export interface QuickShapeStyle {
  size: number
  alpha: number
  rotation: number
  aspectRatio: number
}

export interface QuickShapeBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface QuickShapeDetection {
  family: 'open' | 'closed'
  defaultVariant: QuickShapeVariant
  availableVariants: QuickShapeVariant[]
  style: QuickShapeStyle
  startPoint: [number, number]
  holdPoint: [number, number]
  closedAnchorPoint: [number, number]
  lineStart: [number, number]
  lineEnd: [number, number]
  arcApexOffset: number
  polylineVertices: Array<[number, number]>
  center: [number, number]
  rx: number
  ry: number
  angleRad: number
  rectHalfW: number
  rectHalfH: number
  rectAngleRad: number
  triangleVertices: Array<[number, number]>
  quadVertices: Array<[number, number]>
  pentagonVertices: Array<[number, number]>
  hexagonVertices: Array<[number, number]>
}

export interface QuickShapeGeometryResult {
  waypoints: Array<[number, number]>
  closed: boolean
  curved: boolean
  bounds: QuickShapeBounds
}

export const QUICK_SHAPE_HOLD_DURATION_MS = 380
const MIN_RECORD_POINT_DIST_PX = 1.5
const MIN_STROKE_PATH_LENGTH_PX = 24
const MIN_BOUNDING_SPAN_PX = 12

export const isQuickShapeSupportedTool = (tool?: {
  name?: string
  globalCompositeOperation?: string
}): boolean => {
  if (!tool?.name) return false
  if (tool.globalCompositeOperation === 'destination-out') return false
  if (
    tool.name === 'eraser' ||
    tool.name === 'bucket' ||
    tool.name === 'pipette' ||
    tool.name === 'magicWand'
  ) {
    return false
  }
  return true
}

export const getQuickShapeHoldMoveTolerance = (canvasScale = 1): number =>
  (5.5 * Params.pxScale) / Math.max(0.35, canvasScale || 1)

export const appendQuickShapePoint = (
  points: QuickShapeInputPoint[],
  sample: QuickShapeInputPoint
): boolean => {
  const rx = round(sample.x, 1)
  const ry = round(sample.y, 1)
  if (points.length === 0) {
    points.push({ ...sample, x: rx, y: ry })
    return true
  }
  const last = points[points.length - 1]
  const dx = rx - last.x
  const dy = ry - last.y
  const minDist = MIN_RECORD_POINT_DIST_PX * Params.pxScale
  if (dx * dx + dy * dy < minDist * minDist) {
    return false
  }
  points.push({ ...sample, x: rx, y: ry })
  return true
}

const medianValue = (values: number[], fallback: number): number => {
  if (!values.length) return fallback
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const extractRepresentativeStyle = (points: QuickShapeInputPoint[]): QuickShapeStyle => {
  if (!points.length) {
    return { size: 20, alpha: 0.5, rotation: 0, aspectRatio: 1 }
  }
  const trimCount = points.length >= 6 ? Math.min(3, Math.floor(points.length * 0.15)) : 0
  const body =
    trimCount > 0
      ? points.slice(trimCount, Math.max(trimCount + 1, points.length - trimCount))
      : points

  return {
    size: Math.max(
      1,
      round(
        medianValue(
          body.map((p) => p.size),
          points[0].size
        ),
        1
      )
    ),
    alpha: getNumberInBetween(
      0.001,
      1,
      round(
        medianValue(
          body.map((p) => p.alpha),
          points[0].alpha
        ),
        4
      ),
      4
    ),
    rotation: round(
      medianValue(
        body.map((p) => p.rotation),
        points[0].rotation
      ),
      4
    ),
    aspectRatio: Math.max(
      0.1,
      round(
        medianValue(
          body.map((p) => p.aspectRatio),
          points[0].aspectRatio || 1
        ),
        3
      )
    ),
  }
}

const signedPointToLineDistance = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return Math.hypot(px - x1, py - y1)
  return ((px - x1) * dy - (py - y1) * dx) / len
}

const pointToSegmentDistance = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

const rdpSimplifyOpen = (
  pts: Array<[number, number]>,
  epsilon: number
): Array<[number, number]> => {
  if (pts.length <= 2) return pts
  const [x1, y1] = pts[0]
  const [x2, y2] = pts[pts.length - 1]
  let maxDist = -1
  let maxIdx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointToSegmentDistance(pts[i][0], pts[i][1], x1, y1, x2, y2)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }
  if (maxDist > epsilon && maxIdx > 0) {
    const left = rdpSimplifyOpen(pts.slice(0, maxIdx + 1), epsilon)
    const right = rdpSimplifyOpen(pts.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [pts[0], pts[pts.length - 1]]
}

const rdpSimplifyIndices = (
  pts: Array<[number, number]>,
  startIdx: number,
  endIdx: number,
  epsilon: number
): number[] => {
  if (endIdx - startIdx <= 1) return [startIdx, endIdx]
  const [x1, y1] = pts[startIdx]
  const [x2, y2] = pts[endIdx]
  let maxDist = -1
  let maxIdx = startIdx
  for (let i = startIdx + 1; i < endIdx; i++) {
    const d = pointToSegmentDistance(pts[i][0], pts[i][1], x1, y1, x2, y2)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }
  if (maxDist > epsilon && maxIdx > startIdx) {
    const left = rdpSimplifyIndices(pts, startIdx, maxIdx, epsilon)
    const right = rdpSimplifyIndices(pts, maxIdx, endIdx, epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [startIdx, endIdx]
}

const interiorAngleDeg = (
  prev: [number, number],
  curr: [number, number],
  next: [number, number]
): number => {
  const ux = prev[0] - curr[0]
  const uy = prev[1] - curr[1]
  const vx = next[0] - curr[0]
  const vy = next[1] - curr[1]
  const lu = Math.hypot(ux, uy)
  const lv = Math.hypot(vx, vy)
  if (lu < 1e-6 || lv < 1e-6) return 180
  const cosAngle = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))
  return (Math.acos(cosAngle) * 180) / Math.PI
}

const resampleClosedLoop = (pts: Array<[number, number]>, count = 72): Array<[number, number]> => {
  if (pts.length < 3) return pts
  const closed = [...pts, pts[0]]
  const cumLen: number[] = [0]
  let total = 0
  for (let i = 1; i < closed.length; i++) {
    total += Math.hypot(closed[i][0] - closed[i - 1][0], closed[i][1] - closed[i - 1][1])
    cumLen.push(total)
  }
  if (total < 1e-3) return pts.slice(0, count)

  const out: Array<[number, number]> = []
  let segIdx = 0
  for (let k = 0; k < count; k++) {
    const target = (k * total) / count
    while (segIdx < cumLen.length - 2 && cumLen[segIdx + 1] < target) {
      segIdx++
    }
    const segLen = cumLen[segIdx + 1] - cumLen[segIdx]
    const t = segLen > 1e-6 ? (target - cumLen[segIdx]) / segLen : 0
    const p0 = closed[segIdx]
    const p1 = closed[segIdx + 1]
    out.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t])
  }
  return out
}

const trimClosedLoopOvershoot = (
  pts: Array<[number, number]>,
  diag: number
): Array<[number, number]> => {
  const n = pts.length
  if (n < 10) return pts
  const headLimit = Math.max(2, Math.floor(n * 0.18))
  const tailStart = Math.min(n - 2, Math.ceil(n * 0.82))
  let bestDist = Math.hypot(pts[n - 1][0] - pts[0][0], pts[n - 1][1] - pts[0][1])
  let bestI = 0
  let bestJ = n - 1
  for (let i = 0; i <= headLimit; i++) {
    for (let j = tailStart; j < n; j++) {
      const d = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1])
      if (d < bestDist) {
        bestDist = d
        bestI = i
        bestJ = j
      }
    }
  }
  if (bestDist <= 0.25 * diag && bestJ - bestI >= 6) {
    return pts.slice(bestI, bestJ + 1)
  }
  return pts
}

const computePolygonRmse = (
  loopPts: Array<[number, number]>,
  vertices: Array<[number, number]>,
  normScale: number
): number => {
  const k = vertices.length
  if (k < 3 || normScale < 1e-3) return Infinity
  let sumSq = 0
  for (const [px, py] of loopPts) {
    let minEdgeDist = Infinity
    for (let i = 0; i < k; i++) {
      const a = vertices[i]
      const b = vertices[(i + 1) % k]
      const d = pointToSegmentDistance(px, py, a[0], a[1], b[0], b[1])
      if (d < minEdgeDist) minEdgeDist = d
    }
    sumSq += minEdgeDist * minEdgeDist
  }
  return Math.sqrt(sumSq / loopPts.length) / normScale
}

const fitPolygonOfOrderK = (
  loopPts: Array<[number, number]>,
  centroid: [number, number],
  diag: number,
  targetCount: number
): Array<[number, number]> | null => {
  const N = loopPts.length
  if (N < targetCount * 3) return null

  // Rotate loop so index 0 is farthest from centroid (guaranteed to be a true corner)
  let startOffset = 0
  let maxDistSq = -1
  for (let i = 0; i < N; i++) {
    const dx = loopPts[i][0] - centroid[0]
    const dy = loopPts[i][1] - centroid[1]
    const dSq = dx * dx + dy * dy
    if (dSq > maxDistSq) {
      maxDistSq = dSq
      startOffset = i
    }
  }

  const rotated: Array<[number, number]> = []
  for (let i = 0; i < N; i++) {
    rotated.push(loopPts[(startOffset + i) % N])
  }
  rotated.push(rotated[0])

  const rdpIndices = rdpSimplifyIndices(rotated, 0, N, Math.max(1.5, 0.018 * diag)).slice(0, -1)

  // Merge adjacent corners that are too close, keeping the sharper turning vertex
  const minCornerDist = 0.065 * diag
  const indices: number[] = []
  for (const idx of rdpIndices) {
    if (!indices.length) {
      indices.push(idx)
    } else {
      const prevIdx = indices[indices.length - 1]
      const dist = Math.hypot(
        rotated[idx][0] - rotated[prevIdx][0],
        rotated[idx][1] - rotated[prevIdx][1]
      )
      if (dist >= minCornerDist) {
        indices.push(idx)
      }
    }
  }
  if (
    indices.length > 1 &&
    Math.hypot(
      rotated[indices[indices.length - 1]][0] - rotated[indices[0]][0],
      rotated[indices[indices.length - 1]][1] - rotated[indices[0]][1]
    ) < minCornerDist
  ) {
    indices.pop()
  }

  // If fewer than targetCount corners were found, split the segment with largest chord deviation
  while (indices.length < targetCount) {
    let bestInsertPos = -1
    let bestLoopIdx = -1
    let bestDist = -1
    const m = indices.length
    for (let i = 0; i < m; i++) {
      const aIdx = indices[i]
      const bIdx = i === m - 1 ? N : indices[i + 1]
      if (bIdx - aIdx <= 2) continue
      const [ax, ay] = rotated[aIdx]
      const [bx, by] = rotated[bIdx % N]
      for (let j = aIdx + 1; j < bIdx; j++) {
        const d = pointToSegmentDistance(rotated[j][0], rotated[j][1], ax, ay, bx, by)
        if (d > bestDist) {
          bestDist = d
          bestLoopIdx = j
          bestInsertPos = i + 1
        }
      }
    }
    if (bestInsertPos < 0 || bestLoopIdx < 0) break
    indices.splice(bestInsertPos, 0, bestLoopIdx)
  }

  if (indices.length < targetCount) return null

  // If more than targetCount corners were found, prune the weakest corners
  while (indices.length > targetCount) {
    let weakestPos = 0
    let weakestArea = Infinity
    const m = indices.length
    for (let i = 0; i < m; i++) {
      const prev = rotated[indices[(i - 1 + m) % m]]
      const curr = rotated[indices[i]]
      const next = rotated[indices[(i + 1) % m]]
      const area2 = Math.abs(
        (prev[0] - curr[0]) * (next[1] - curr[1]) - (prev[1] - curr[1]) * (next[0] - curr[0])
      )
      if (area2 < weakestArea) {
        weakestArea = area2
        weakestPos = i
      }
    }
    indices.splice(weakestPos, 1)
  }

  // Refine each corner index to the exact peak between its neighboring corners
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < targetCount; i++) {
      const prevIdx = indices[(i - 1 + targetCount) % targetCount]
      const nextIdx = indices[(i + 1) % targetCount]
      const [ax, ay] = rotated[prevIdx]
      const [bx, by] = rotated[nextIdx]
      const span = (nextIdx - prevIdx + N) % N
      if (span <= 4) continue
      let bestJ = indices[i]
      let maxD = -1
      for (let step = 2; step <= span - 2; step++) {
        const j = (prevIdx + step) % N
        const d = pointToSegmentDistance(rotated[j][0], rotated[j][1], ax, ay, bx, by)
        if (d > maxD) {
          maxD = d
          bestJ = j
        }
      }
      indices[i] = bestJ
    }
  }

  return indices.map((idx): [number, number] => [
    round(rotated[idx][0], 1),
    round(rotated[idx][1], 1),
  ])
}

const fitOrientedEllipse = (
  loopPts: Array<[number, number]>
): {
  center: [number, number]
  rx: number
  ry: number
  angleRad: number
  rmse: number
} => {
  const m = loopPts.length
  let cx = 0
  let cy = 0
  for (const [x, y] of loopPts) {
    cx += x
    cy += y
  }
  cx /= m
  cy /= m

  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const [x, y] of loopPts) {
    const dx = x - cx
    const dy = y - cy
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  sxx /= m
  syy /= m
  sxy /= m

  const angleRad = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)

  let u2 = 0
  let v2 = 0
  const uv: Array<[number, number]> = []
  for (const [x, y] of loopPts) {
    const dx = x - cx
    const dy = y - cy
    const u = dx * cosA + dy * sinA
    const v = -dx * sinA + dy * cosA
    uv.push([u, v])
    u2 += u * u
    v2 += v * v
  }
  u2 /= m
  v2 /= m

  let rx = Math.max(2, Math.sqrt(2 * u2))
  let ry = Math.max(2, Math.sqrt(2 * v2))

  let meanRho = 0
  for (const [u, v] of uv) {
    meanRho += Math.hypot(u / rx, v / ry)
  }
  meanRho /= m
  if (meanRho > 0.1) {
    rx *= meanRho
    ry *= meanRho
  }

  let errSq = 0
  for (const [u, v] of uv) {
    const rho = Math.hypot(u / rx, v / ry)
    const diff = rho - 1
    errSq += diff * diff
  }
  const rmse = Math.sqrt(errSq / m)

  return {
    center: [round(cx, 1), round(cy, 1)],
    rx: round(rx, 1),
    ry: round(ry, 1),
    angleRad: round(angleRad, 4),
    rmse,
  }
}

const fitOrientedRectangle = (
  loopPts: Array<[number, number]>,
  quadVerts?: Array<[number, number]>,
  fallbackAngle = 0
): {
  center: [number, number]
  halfW: number
  halfH: number
  angleRad: number
} => {
  let angleRad = fallbackAngle
  if (quadVerts && quadVerts.length === 4) {
    let sumCos = 0
    let sumSin = 0
    for (let i = 0; i < 4; i++) {
      const a = quadVerts[i]
      const b = quadVerts[(i + 1) % 4]
      const edgeAngle = Math.atan2(b[1] - a[1], b[0] - a[0])
      sumCos += Math.cos(4 * edgeAngle)
      sumSin += Math.sin(4 * edgeAngle)
    }
    angleRad = 0.25 * Math.atan2(sumSin, sumCos)
  }

  const snapRad = convertAngleDegToRad(6)
  const mod90 = ((angleRad % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)
  if (mod90 < snapRad || Math.PI / 2 - mod90 < snapRad) {
    angleRad = Math.round(angleRad / (Math.PI / 2)) * (Math.PI / 2)
  }

  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)

  const sourcePts = quadVerts && quadVerts.length === 4 ? quadVerts : loopPts
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const [x, y] of sourcePts) {
    const u = x * cosA + y * sinA
    const v = -x * sinA + y * cosA
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }
  const midU = (minU + maxU) / 2
  const midV = (minV + maxV) / 2
  const cx = midU * cosA - midV * sinA
  const cy = midU * sinA + midV * cosA

  return {
    center: [round(cx, 1), round(cy, 1)],
    halfW: Math.max(4, round((maxU - minU) / 2, 1)),
    halfH: Math.max(4, round((maxV - minV) / 2, 1)),
    angleRad: round(angleRad, 4),
  }
}

const buildRectangleVertices = (
  center: [number, number],
  halfW: number,
  halfH: number,
  angleRad: number
): Array<[number, number]> => {
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)
  const local: Array<[number, number]> = [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH],
  ]
  return local.map(([u, v]) => [
    round(center[0] + u * cosA - v * sinA, 1),
    round(center[1] + u * sinA + v * cosA, 1),
  ])
}

const polygonSignedArea2 = (verts: Array<[number, number]>): number => {
  const k = verts.length
  let area2 = 0
  for (let i = 0; i < k; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % k]
    area2 += a[0] * b[1] - b[0] * a[1]
  }
  return area2
}

const buildRegularPolygonVertices = (
  sides: number,
  fittedVerts: Array<[number, number]>,
  fallbackCenter: [number, number],
  fallbackRadius: number
): Array<[number, number]> => {
  let cx = fallbackCenter[0]
  let cy = fallbackCenter[1]
  let radius = fallbackRadius
  let baseAngle = -Math.PI / 2
  let stepSign = 1

  if (fittedVerts.length === sides) {
    cx = 0
    cy = 0
    for (const [x, y] of fittedVerts) {
      cx += x
      cy += y
    }
    cx /= sides
    cy /= sides

    let sumR = 0
    for (const [x, y] of fittedVerts) {
      sumR += Math.hypot(x - cx, y - cy)
    }
    radius = Math.max(6, sumR / sides)
    stepSign = polygonSignedArea2(fittedVerts) >= 0 ? 1 : -1

    let sumCos = 0
    let sumSin = 0
    for (let i = 0; i < sides; i++) {
      const theta = Math.atan2(fittedVerts[i][1] - cy, fittedVerts[i][0] - cx)
      const expectedOffset = stepSign * ((i * 2 * Math.PI) / sides)
      sumCos += Math.cos(theta - expectedOffset)
      sumSin += Math.sin(theta - expectedOffset)
    }
    baseAngle = Math.atan2(sumSin, sumCos)

    // Snap orientation if close to an upright vertex or flat horizontal edge
    const snapStep = Math.PI / sides
    const rel = baseAngle + Math.PI / 2
    const nearestRel = Math.round(rel / snapStep) * snapStep
    if (Math.abs(rel - nearestRel) <= convertAngleDegToRad(7)) {
      baseAngle = nearestRel - Math.PI / 2
    }
  }

  const out: Array<[number, number]> = []
  for (let i = 0; i < sides; i++) {
    const a = baseAngle + stepSign * ((i * 2 * Math.PI) / sides)
    out.push([round(cx + radius * Math.cos(a), 1), round(cy + radius * Math.sin(a), 1)])
  }
  return out
}

const isPolygonCloseToRegular = (
  verts: Array<[number, number]>,
  minSideRatio: number,
  minRadiusRatio: number
): boolean => {
  const k = verts.length
  if (k < 3) return false
  let cx = 0
  let cy = 0
  for (const [x, y] of verts) {
    cx += x
    cy += y
  }
  cx /= k
  cy /= k

  let minSide = Infinity
  let maxSide = -Infinity
  let minR = Infinity
  let maxR = -Infinity

  for (let i = 0; i < k; i++) {
    const curr = verts[i]
    const next = verts[(i + 1) % k]
    const side = Math.hypot(next[0] - curr[0], next[1] - curr[1])
    const r = Math.hypot(curr[0] - cx, curr[1] - cy)
    if (side < minSide) minSide = side
    if (side > maxSide) maxSide = side
    if (r < minR) minR = r
    if (r > maxR) maxR = r
  }

  if (maxSide <= 0 || maxR <= 0) return false
  return minSide / maxSide >= minSideRatio && minR / maxR >= minRadiusRatio
}

const validatePolygonAnglesAndEdges = (
  verts: Array<[number, number]>,
  diag: number,
  minAngleDeg: number,
  maxAngleDeg: number,
  minEdgeRatio: number
): boolean => {
  const k = verts.length
  const minEdge = minEdgeRatio * diag
  const area2 = polygonSignedArea2(verts)
  if (Math.abs(area2) < 1e-2) return false
  const areaSign = area2 >= 0 ? 1 : -1

  for (let i = 0; i < k; i++) {
    const prev = verts[(i - 1 + k) % k]
    const curr = verts[i]
    const next = verts[(i + 1) % k]
    const edgeLen = Math.hypot(next[0] - curr[0], next[1] - curr[1])
    if (edgeLen < minEdge) return false
    const ang = interiorAngleDeg(prev, curr, next)
    if (ang < minAngleDeg || ang > maxAngleDeg) return false
    // Ensure polygon is convex (every vertex turns in the same direction)
    const cross =
      (curr[0] - prev[0]) * (next[1] - curr[1]) - (curr[1] - prev[1]) * (next[0] - curr[0])
    if (cross * areaSign <= 0) return false
  }
  return true
}

const findFarthestPointFrom = (
  candidates: Array<[number, number]>,
  refPoint: [number, number]
): [number, number] => {
  let best = candidates[0] || refPoint
  let maxDistSq = -1
  for (const pt of candidates) {
    const dx = pt[0] - refPoint[0]
    const dy = pt[1] - refPoint[1]
    const dSq = dx * dx + dy * dy
    if (dSq > maxDistSq) {
      maxDistSq = dSq
      best = pt
    }
  }
  return [best[0], best[1]]
}

export const detectQuickShape = (
  rawPoints: QuickShapeInputPoint[],
  canvasScale = 1
): QuickShapeDetection | null => {
  if (!rawPoints || rawPoints.length < 4) return null

  const unit = Params.pxScale / Math.max(0.35, canvasScale || 1)
  const pts: Array<[number, number]> = rawPoints.map((p) => [p.x, p.y])

  let pathLength = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (i > 0) {
      pathLength += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1])
    }
  }

  const bboxW = maxX - minX
  const bboxH = maxY - minY
  const diag = Math.hypot(bboxW, bboxH)

  if (pathLength < MIN_STROKE_PATH_LENGTH_PX * unit || diag < MIN_BOUNDING_SPAN_PX * unit) {
    return null
  }

  const startPoint: [number, number] = [pts[0][0], pts[0][1]]
  const holdPoint: [number, number] = [pts[pts.length - 1][0], pts[pts.length - 1][1]]
  const startEndDist = Math.hypot(holdPoint[0] - startPoint[0], holdPoint[1] - startPoint[1])
  const style = extractRepresentativeStyle(rawPoints)

  // Check if closed loop
  const trimmedClosedPts = trimClosedLoopOvershoot(pts, diag)
  const trimmedStartEndDist = Math.hypot(
    trimmedClosedPts[trimmedClosedPts.length - 1][0] - trimmedClosedPts[0][0],
    trimmedClosedPts[trimmedClosedPts.length - 1][1] - trimmedClosedPts[0][1]
  )
  const isClosedLoop =
    pathLength >= 1.75 * diag &&
    pathLength <= 4.35 * diag &&
    (startEndDist <= Math.max(28 * unit, 0.34 * diag) || trimmedStartEndDist <= 0.25 * diag)

  if (isClosedLoop) {
    const loopPts = resampleClosedLoop(trimmedClosedPts, 72)
    const ellipse = fitOrientedEllipse(loopPts)
    const minEllipseRatio = Math.min(ellipse.rx, ellipse.ry) / Math.max(1, ellipse.rx, ellipse.ry)

    if (minEllipseRatio >= 0.14) {
      const normScale = Math.max(8, (ellipse.rx + ellipse.ry) / 2)
      const meanR = (ellipse.rx + ellipse.ry) / 2

      const triCandidate = fitPolygonOfOrderK(loopPts, ellipse.center, diag, 3)
      const triValid =
        triCandidate !== null && validatePolygonAnglesAndEdges(triCandidate, diag, 18, 142, 0.22)
      const triRmse =
        triValid && triCandidate ? computePolygonRmse(loopPts, triCandidate, normScale) : Infinity

      const quadCandidate = fitPolygonOfOrderK(loopPts, ellipse.center, diag, 4)
      const quadValid =
        quadCandidate !== null && validatePolygonAnglesAndEdges(quadCandidate, diag, 32, 145, 0.15)
      const quadRmse =
        quadValid && quadCandidate
          ? computePolygonRmse(loopPts, quadCandidate, normScale)
          : Infinity

      const pentCandidate = fitPolygonOfOrderK(loopPts, ellipse.center, diag, 5)
      const pentValid =
        pentCandidate !== null && validatePolygonAnglesAndEdges(pentCandidate, diag, 55, 146, 0.13)
      const pentRmse =
        pentValid && pentCandidate
          ? computePolygonRmse(loopPts, pentCandidate, normScale)
          : Infinity

      const hexCandidate = fitPolygonOfOrderK(loopPts, ellipse.center, diag, 6)
      const hexValid =
        hexCandidate !== null && validatePolygonAnglesAndEdges(hexCandidate, diag, 72, 150, 0.11)
      const hexRmse =
        hexValid && hexCandidate ? computePolygonRmse(loopPts, hexCandidate, normScale) : Infinity

      const fallbackTriangle =
        triCandidate && triCandidate.length === 3
          ? triCandidate
          : buildRegularPolygonVertices(3, [], ellipse.center, meanR)

      const rectFit = fitOrientedRectangle(loopPts, quadCandidate ?? undefined, ellipse.angleRad)
      const fallbackQuad =
        quadCandidate && quadCandidate.length === 4
          ? quadCandidate
          : buildRectangleVertices(rectFit.center, rectFit.halfW, rectFit.halfH, rectFit.angleRad)

      const fallbackPentagon =
        pentCandidate && pentCandidate.length === 5
          ? pentCandidate
          : buildRegularPolygonVertices(5, [], ellipse.center, meanR)

      const fallbackHexagon =
        hexCandidate && hexCandidate.length === 6
          ? hexCandidate
          : buildRegularPolygonVertices(6, [], ellipse.center, meanR)

      const closedAnchorPoint = findFarthestPointFrom(loopPts, holdPoint)

      // Select best polygon order k in {3, 4, 5, 6} using Occam's razor complexity threshold
      const polyCandidates: Array<{
        k: 3 | 4 | 5 | 6
        rmse: number
        maxRmse: number
        ellipseRatioLimit: number
      }> = [
        { k: 3, rmse: triRmse, maxRmse: 0.145, ellipseRatioLimit: 0.96 },
        { k: 4, rmse: quadRmse, maxRmse: 0.135, ellipseRatioLimit: 1.05 },
        { k: 5, rmse: pentRmse, maxRmse: 0.085, ellipseRatioLimit: 0.9 },
        { k: 6, rmse: hexRmse, maxRmse: 0.072, ellipseRatioLimit: 0.88 },
      ]

      let bestPoly: (typeof polyCandidates)[number] | null = null
      for (const cand of polyCandidates) {
        if (!Number.isFinite(cand.rmse) || cand.rmse > cand.maxRmse) continue
        if (!bestPoly) {
          bestPoly = cand
        } else if (cand.rmse < bestPoly.rmse * 0.65 && bestPoly.rmse - cand.rmse > 0.018) {
          bestPoly = cand
        }
      }

      if (bestPoly && bestPoly.rmse < ellipse.rmse * bestPoly.ellipseRatioLimit) {
        if (bestPoly.k === 3) {
          const isEquilateral = isPolygonCloseToRegular(fallbackTriangle, 0.82, 0.78)
          const defaultVariant: QuickShapeVariant = isEquilateral ? 'equilateral' : 'triangle'
          return {
            family: 'closed',
            defaultVariant,
            availableVariants: ['triangle', 'equilateral', 'freehand'],
            style,
            startPoint,
            holdPoint,
            closedAnchorPoint,
            lineStart: startPoint,
            lineEnd: holdPoint,
            arcApexOffset: 0,
            polylineVertices: [startPoint, holdPoint],
            center: ellipse.center,
            rx: ellipse.rx,
            ry: ellipse.ry,
            angleRad: ellipse.angleRad,
            rectHalfW: rectFit.halfW,
            rectHalfH: rectFit.halfH,
            rectAngleRad: rectFit.angleRad,
            triangleVertices: fallbackTriangle,
            quadVertices: fallbackQuad,
            pentagonVertices: fallbackPentagon,
            hexagonVertices: fallbackHexagon,
          }
        }

        if (bestPoly.k === 4) {
          let maxRightAngleDiff = 0
          for (let i = 0; i < 4; i++) {
            const prev = fallbackQuad[(i + 3) % 4]
            const curr = fallbackQuad[i]
            const next = fallbackQuad[(i + 1) % 4]
            const diff = Math.abs(interiorAngleDeg(prev, curr, next) - 90)
            if (diff > maxRightAngleDiff) maxRightAngleDiff = diff
          }
          const isRectangular = maxRightAngleDiff <= 22
          const aspect =
            Math.min(rectFit.halfW, rectFit.halfH) / Math.max(1, rectFit.halfW, rectFit.halfH)
          const defaultVariant: QuickShapeVariant = isRectangular
            ? aspect >= 0.85
              ? 'square'
              : 'rect'
            : 'quad'

          return {
            family: 'closed',
            defaultVariant,
            availableVariants: ['rect', 'square', 'quad', 'freehand'],
            style,
            startPoint,
            holdPoint,
            closedAnchorPoint,
            lineStart: startPoint,
            lineEnd: holdPoint,
            arcApexOffset: 0,
            polylineVertices: [startPoint, holdPoint],
            center: rectFit.center,
            rx: ellipse.rx,
            ry: ellipse.ry,
            angleRad: ellipse.angleRad,
            rectHalfW: rectFit.halfW,
            rectHalfH: rectFit.halfH,
            rectAngleRad: rectFit.angleRad,
            triangleVertices: fallbackTriangle,
            quadVertices: fallbackQuad,
            pentagonVertices: fallbackPentagon,
            hexagonVertices: fallbackHexagon,
          }
        }

        if (bestPoly.k === 5) {
          const isRegular = isPolygonCloseToRegular(fallbackPentagon, 0.68, 0.72)
          const defaultVariant: QuickShapeVariant = isRegular ? 'regularPentagon' : 'pentagon'
          return {
            family: 'closed',
            defaultVariant,
            availableVariants: ['pentagon', 'regularPentagon', 'freehand'],
            style,
            startPoint,
            holdPoint,
            closedAnchorPoint,
            lineStart: startPoint,
            lineEnd: holdPoint,
            arcApexOffset: 0,
            polylineVertices: [startPoint, holdPoint],
            center: ellipse.center,
            rx: ellipse.rx,
            ry: ellipse.ry,
            angleRad: ellipse.angleRad,
            rectHalfW: rectFit.halfW,
            rectHalfH: rectFit.halfH,
            rectAngleRad: rectFit.angleRad,
            triangleVertices: fallbackTriangle,
            quadVertices: fallbackQuad,
            pentagonVertices: fallbackPentagon,
            hexagonVertices: fallbackHexagon,
          }
        }

        if (bestPoly.k === 6) {
          const isRegular = isPolygonCloseToRegular(fallbackHexagon, 0.68, 0.72)
          const defaultVariant: QuickShapeVariant = isRegular ? 'regularHexagon' : 'hexagon'
          return {
            family: 'closed',
            defaultVariant,
            availableVariants: ['hexagon', 'regularHexagon', 'freehand'],
            style,
            startPoint,
            holdPoint,
            closedAnchorPoint,
            lineStart: startPoint,
            lineEnd: holdPoint,
            arcApexOffset: 0,
            polylineVertices: [startPoint, holdPoint],
            center: ellipse.center,
            rx: ellipse.rx,
            ry: ellipse.ry,
            angleRad: ellipse.angleRad,
            rectHalfW: rectFit.halfW,
            rectHalfH: rectFit.halfH,
            rectAngleRad: rectFit.angleRad,
            triangleVertices: fallbackTriangle,
            quadVertices: fallbackQuad,
            pentagonVertices: fallbackPentagon,
            hexagonVertices: fallbackHexagon,
          }
        }
      }

      // Ellipse / Circle check
      if (ellipse.rmse <= 0.17) {
        const isCircle = minEllipseRatio >= 0.87
        const defaultVariant: QuickShapeVariant = isCircle ? 'circle' : 'ellipse'

        return {
          family: 'closed',
          defaultVariant,
          availableVariants: ['ellipse', 'circle', 'freehand'],
          style,
          startPoint,
          holdPoint,
          closedAnchorPoint,
          lineStart: startPoint,
          lineEnd: holdPoint,
          arcApexOffset: 0,
          polylineVertices: [startPoint, holdPoint],
          center: ellipse.center,
          rx: ellipse.rx,
          ry: ellipse.ry,
          angleRad: ellipse.angleRad,
          rectHalfW: rectFit.halfW,
          rectHalfH: rectFit.halfH,
          rectAngleRad: rectFit.angleRad,
          triangleVertices: fallbackTriangle,
          quadVertices: fallbackQuad,
          pentagonVertices: fallbackPentagon,
          hexagonVertices: fallbackHexagon,
        }
      }
    }
  }

  // Open shape analysis (Line, Arc, or Open Polyline)
  if (startEndDist < MIN_BOUNDING_SPAN_PX * unit) {
    return null
  }

  let maxPosPerp = 0
  let maxNegPerp = 0
  let maxAbsPerp = 0
  let signedApex = 0

  for (const [px, py] of pts) {
    const d = signedPointToLineDistance(
      px,
      py,
      startPoint[0],
      startPoint[1],
      holdPoint[0],
      holdPoint[1]
    )
    if (d > maxPosPerp) maxPosPerp = d
    if (d < maxNegPerp) maxNegPerp = d
    if (Math.abs(d) > maxAbsPerp) {
      maxAbsPerp = Math.abs(d)
      signedApex = d
    }
  }

  // 1. Straight Line
  if (maxAbsPerp <= Math.max(8 * unit, 0.08 * startEndDist) && pathLength <= 1.15 * startEndDist) {
    return {
      family: 'open',
      defaultVariant: 'line',
      availableVariants: ['line', 'freehand'],
      style,
      startPoint,
      holdPoint,
      closedAnchorPoint: startPoint,
      lineStart: startPoint,
      lineEnd: holdPoint,
      arcApexOffset: 0,
      polylineVertices: [startPoint, holdPoint],
      center: [
        round((startPoint[0] + holdPoint[0]) / 2, 1),
        round((startPoint[1] + holdPoint[1]) / 2, 1),
      ],
      rx: round(startEndDist / 2, 1),
      ry: round(startEndDist / 2, 1),
      angleRad: 0,
      rectHalfW: round(startEndDist / 2, 1),
      rectHalfH: round(startEndDist / 2, 1),
      rectAngleRad: 0,
      triangleVertices: [],
      quadVertices: [],
      pentagonVertices: [],
      hexagonVertices: [],
    }
  }

  // Check if open polyline with 2-4 crisp straight segments (e.g. L-corner or U-bracket)
  const rdpOpen = rdpSimplifyOpen(pts, Math.max(4 * unit, 0.055 * diag))
  let isCleanPolyline = false
  if (rdpOpen.length >= 3 && rdpOpen.length <= 5 && pathLength <= 2.8 * startEndDist) {
    let anglesOk = true
    for (let i = 1; i < rdpOpen.length - 1; i++) {
      const ang = interiorAngleDeg(rdpOpen[i - 1], rdpOpen[i], rdpOpen[i + 1])
      if (ang < 22 || ang > 142) {
        anglesOk = false
        break
      }
    }
    if (anglesOk) {
      let maxPolyErr = 0
      for (const [px, py] of pts) {
        let minSegD = Infinity
        for (let i = 0; i < rdpOpen.length - 1; i++) {
          const d = pointToSegmentDistance(
            px,
            py,
            rdpOpen[i][0],
            rdpOpen[i][1],
            rdpOpen[i + 1][0],
            rdpOpen[i + 1][1]
          )
          if (d < minSegD) minSegD = d
        }
        if (minSegD > maxPolyErr) maxPolyErr = minSegD
      }
      if (maxPolyErr <= Math.max(7 * unit, 0.042 * diag)) {
        isCleanPolyline = true
      }
    }
  }

  // 2. Single-arch Arc check (no strong S-curve inflection)
  const minOppositeSide = Math.min(maxPosPerp, Math.abs(maxNegPerp))
  const isSingleArch =
    minOppositeSide <= Math.max(8 * unit, 0.18 * maxAbsPerp) &&
    pathLength <= 2.35 * startEndDist &&
    maxAbsPerp <= 0.85 * startEndDist

  if (isCleanPolyline) {
    return {
      family: 'open',
      defaultVariant: 'polyline',
      availableVariants: ['polyline', 'freehand'],
      style,
      startPoint,
      holdPoint,
      closedAnchorPoint: startPoint,
      lineStart: startPoint,
      lineEnd: holdPoint,
      arcApexOffset: round(signedApex, 1),
      polylineVertices: rdpOpen.map(([x, y]) => [round(x, 1), round(y, 1)]),
      center: [
        round((startPoint[0] + holdPoint[0]) / 2, 1),
        round((startPoint[1] + holdPoint[1]) / 2, 1),
      ],
      rx: round(startEndDist / 2, 1),
      ry: round(startEndDist / 2, 1),
      angleRad: 0,
      rectHalfW: round(startEndDist / 2, 1),
      rectHalfH: round(startEndDist / 2, 1),
      rectAngleRad: 0,
      triangleVertices: [],
      quadVertices: [],
      pentagonVertices: [],
      hexagonVertices: [],
    }
  }

  if (isSingleArch) {
    return {
      family: 'open',
      defaultVariant: 'arc',
      availableVariants: ['arc', 'freehand'],
      style,
      startPoint,
      holdPoint,
      closedAnchorPoint: startPoint,
      lineStart: startPoint,
      lineEnd: holdPoint,
      arcApexOffset: round(signedApex, 1),
      polylineVertices: rdpOpen.map(([x, y]) => [round(x, 1), round(y, 1)]),
      center: [
        round((startPoint[0] + holdPoint[0]) / 2, 1),
        round((startPoint[1] + holdPoint[1]) / 2, 1),
      ],
      rx: round(startEndDist / 2, 1),
      ry: round(startEndDist / 2, 1),
      angleRad: 0,
      rectHalfW: round(startEndDist / 2, 1),
      rectHalfH: round(startEndDist / 2, 1),
      rectAngleRad: 0,
      triangleVertices: [],
      quadVertices: [],
      pentagonVertices: [],
      hexagonVertices: [],
    }
  }

  return null
}

const sampleCircularArcPoints = (
  start: [number, number],
  end: [number, number],
  apexOffset: number
): Array<[number, number]> => {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const chord = Math.hypot(dx, dy)
  if (chord < 2 || Math.abs(apexOffset) < 1.5) {
    return [start, end]
  }
  const midX = (start[0] + end[0]) / 2
  const midY = (start[1] + end[1]) / 2
  const nx = dy / chord
  const ny = -dx / chord

  const h = apexOffset
  const R = h / 2 + (chord * chord) / (8 * h)
  const cx = midX + (h - R) * nx
  const cy = midY + (h - R) * ny
  const absR = Math.abs(R)

  const aStart = Math.atan2(start[1] - cy, start[0] - cx)
  const apexX = midX + h * nx
  const apexY = midY + h * ny
  const aApex = Math.atan2(apexY - cy, apexX - cx)
  const aEnd = Math.atan2(end[1] - cy, end[0] - cx)

  const normalizeDelta = (from: number, to: number, ccw: boolean): number => {
    let d = to - from
    if (ccw) {
      while (d < 0) d += 2 * Math.PI
      while (d >= 2 * Math.PI) d -= 2 * Math.PI
    } else {
      while (d > 0) d -= 2 * Math.PI
      while (d <= -2 * Math.PI) d += 2 * Math.PI
    }
    return d
  }

  const ccwTotal = normalizeDelta(aStart, aEnd, true)
  const ccwApex = normalizeDelta(aStart, aApex, true)
  const useCcw = ccwApex <= ccwTotal + 1e-4
  const totalSweep = useCcw ? ccwTotal : normalizeDelta(aStart, aEnd, false)

  const arcLen = Math.abs(totalSweep) * absR
  const steps = Math.max(12, Math.min(120, Math.ceil(arcLen / 6)))
  const out: Array<[number, number]> = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const ang = aStart + totalSweep * t
    out.push([round(cx + absR * Math.cos(ang), 1), round(cy + absR * Math.sin(ang), 1)])
  }
  out[0] = [round(start[0], 1), round(start[1], 1)]
  out[out.length - 1] = [round(end[0], 1), round(end[1], 1)]
  return out
}

const sampleEllipsePoints = (
  center: [number, number],
  rx: number,
  ry: number,
  angleRad: number,
  startRef: [number, number]
): Array<[number, number]> => {
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)
  const dx = startRef[0] - center[0]
  const dy = startRef[1] - center[1]
  const localU = dx * cosA + dy * sinA
  const localV = -dx * sinA + dy * cosA
  const startTheta = Math.atan2(localV / Math.max(1, ry), localU / Math.max(1, rx))

  const approxCirc =
    Math.PI * (3 * (rx + ry) - Math.sqrt(Math.max(1, (3 * rx + ry) * (rx + 3 * ry))))
  const steps = Math.max(36, Math.min(160, Math.ceil(approxCirc / 6)))
  const out: Array<[number, number]> = []
  for (let i = 0; i <= steps; i++) {
    const theta = startTheta + (i * 2 * Math.PI) / steps
    const u = rx * Math.cos(theta)
    const v = ry * Math.sin(theta)
    out.push([round(center[0] + u * cosA - v * sinA, 1), round(center[1] + u * sinA + v * cosA, 1)])
  }
  out[out.length - 1] = [out[0][0], out[0][1]]
  return out
}

const applySimilarityTransformToPoints = (
  pts: Array<[number, number]>,
  anchor: [number, number],
  scale: number,
  deltaRad: number
): Array<[number, number]> => {
  const cosD = Math.cos(deltaRad)
  const sinD = Math.sin(deltaRad)
  return pts.map(([x, y]) => {
    const dx = (x - anchor[0]) * scale
    const dy = (y - anchor[1]) * scale
    return [
      round(anchor[0] + dx * cosD - dy * sinD, 1),
      round(anchor[1] + dx * sinD + dy * cosD, 1),
    ]
  })
}

const computeBoundsForWaypoints = (
  waypoints: Array<[number, number]>,
  pad = 0
): QuickShapeBounds => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of waypoints) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }
  return {
    minX: round(minX - pad, 1),
    minY: round(minY - pad, 1),
    maxX: round(maxX + pad, 1),
    maxY: round(maxY + pad, 1),
  }
}

export const computeQuickShapeGeometry = (
  detection: QuickShapeDetection,
  variant: QuickShapeVariant,
  dragPoint?: [number, number]
): QuickShapeGeometryResult => {
  const pad = Math.ceil((detection.style.size || 10) / 2)
  const targetHold = dragPoint ?? detection.holdPoint

  if (detection.family === 'open') {
    const start = detection.lineStart
    const end: [number, number] = [round(targetHold[0], 1), round(targetHold[1], 1)]

    if (variant === 'arc') {
      const origChord = Math.max(
        1,
        Math.hypot(
          detection.lineEnd[0] - detection.lineStart[0],
          detection.lineEnd[1] - detection.lineStart[1]
        )
      )
      const newChord = Math.hypot(end[0] - start[0], end[1] - start[1])
      const scaledApex = detection.arcApexOffset * (newChord / origChord)
      const waypoints = sampleCircularArcPoints(start, end, scaledApex)
      return {
        waypoints,
        closed: false,
        curved: true,
        bounds: computeBoundsForWaypoints(waypoints, pad),
      }
    }

    if (variant === 'polyline' && detection.polylineVertices.length >= 3) {
      const v0x = detection.lineEnd[0] - detection.lineStart[0]
      const v0y = detection.lineEnd[1] - detection.lineStart[1]
      const len0 = Math.hypot(v0x, v0y)
      const v1x = end[0] - start[0]
      const v1y = end[1] - start[1]
      const len1 = Math.hypot(v1x, v1y)
      const scale = len0 > 4 ? getNumberInBetween(0.1, 10, len1 / len0, 4) : 1
      const deltaRad = len0 > 4 && len1 > 4 ? Math.atan2(v1y, v1x) - Math.atan2(v0y, v0x) : 0
      const waypoints = applySimilarityTransformToPoints(
        detection.polylineVertices,
        start,
        scale,
        deltaRad
      )
      return {
        waypoints,
        closed: false,
        curved: false,
        bounds: computeBoundsForWaypoints(waypoints, pad),
      }
    }

    const waypoints: Array<[number, number]> = [
      [round(start[0], 1), round(start[1], 1)],
      [round(end[0], 1), round(end[1], 1)],
    ]
    return {
      waypoints,
      closed: false,
      curved: false,
      bounds: computeBoundsForWaypoints(waypoints, pad),
    }
  }

  // Closed family transform around closedAnchorPoint
  const anchor = detection.closedAnchorPoint
  const origVx = detection.holdPoint[0] - anchor[0]
  const origVy = detection.holdPoint[1] - anchor[1]
  const origLen = Math.hypot(origVx, origVy)
  const currVx = targetHold[0] - anchor[0]
  const currVy = targetHold[1] - anchor[1]
  const currLen = Math.hypot(currVx, currVy)

  const scale = origLen > 4 && currLen > 4 ? getNumberInBetween(0.1, 10, currLen / origLen, 4) : 1
  const deltaRad =
    origLen > 4 && currLen > 4 ? Math.atan2(currVy, currVx) - Math.atan2(origVy, origVx) : 0

  const [transCenter] = applySimilarityTransformToPoints(
    [detection.center],
    anchor,
    scale,
    deltaRad
  )
  const startRef = applySimilarityTransformToPoints(
    [detection.startPoint],
    anchor,
    scale,
    deltaRad
  )[0]

  if (variant === 'circle' || variant === 'ellipse') {
    const meanR = round(((detection.rx + detection.ry) / 2) * scale, 1)
    const rx = variant === 'circle' ? meanR : round(detection.rx * scale, 1)
    const ry = variant === 'circle' ? meanR : round(detection.ry * scale, 1)
    const waypoints = sampleEllipsePoints(
      transCenter,
      Math.max(3, rx),
      Math.max(3, ry),
      detection.angleRad + deltaRad,
      startRef
    )
    return {
      waypoints,
      closed: true,
      curved: true,
      bounds: computeBoundsForWaypoints(waypoints, pad),
    }
  }

  if (variant === 'triangle' || variant === 'equilateral') {
    const baseVerts =
      variant === 'equilateral'
        ? buildRegularPolygonVertices(
            3,
            detection.triangleVertices,
            detection.center,
            (detection.rx + detection.ry) / 2
          )
        : detection.triangleVertices
    const transformed = applySimilarityTransformToPoints(baseVerts, anchor, scale, deltaRad)
    const waypoints = [...transformed, transformed[0]]
    return {
      waypoints,
      closed: true,
      curved: false,
      bounds: computeBoundsForWaypoints(waypoints, pad),
    }
  }

  if (variant === 'rect' || variant === 'square' || variant === 'quad') {
    let baseVerts: Array<[number, number]>
    if (variant === 'quad') {
      baseVerts = detection.quadVertices
    } else {
      const meanHalf = (detection.rectHalfW + detection.rectHalfH) / 2
      const halfW = variant === 'square' ? meanHalf : detection.rectHalfW
      const halfH = variant === 'square' ? meanHalf : detection.rectHalfH
      baseVerts = buildRectangleVertices(detection.center, halfW, halfH, detection.rectAngleRad)
    }
    const transformed = applySimilarityTransformToPoints(baseVerts, anchor, scale, deltaRad)
    const waypoints = [...transformed, transformed[0]]
    return {
      waypoints,
      closed: true,
      curved: false,
      bounds: computeBoundsForWaypoints(waypoints, pad),
    }
  }

  if (variant === 'pentagon' || variant === 'regularPentagon') {
    const baseVerts =
      variant === 'regularPentagon'
        ? buildRegularPolygonVertices(
            5,
            detection.pentagonVertices,
            detection.center,
            (detection.rx + detection.ry) / 2
          )
        : detection.pentagonVertices
    const transformed = applySimilarityTransformToPoints(baseVerts, anchor, scale, deltaRad)
    const waypoints = [...transformed, transformed[0]]
    return {
      waypoints,
      closed: true,
      curved: false,
      bounds: computeBoundsForWaypoints(waypoints, pad),
    }
  }

  if (variant === 'hexagon' || variant === 'regularHexagon') {
    const baseVerts =
      variant === 'regularHexagon'
        ? buildRegularPolygonVertices(
            6,
            detection.hexagonVertices,
            detection.center,
            (detection.rx + detection.ry) / 2
          )
        : detection.hexagonVertices
    const transformed = applySimilarityTransformToPoints(baseVerts, anchor, scale, deltaRad)
    const waypoints = [...transformed, transformed[0]]
    return {
      waypoints,
      closed: true,
      curved: false,
      bounds: computeBoundsForWaypoints(waypoints, pad),
    }
  }

  const fallbackWaypoints = sampleEllipsePoints(
    transCenter,
    Math.max(3, round(detection.rx * scale, 1)),
    Math.max(3, round(detection.ry * scale, 1)),
    detection.angleRad + deltaRad,
    startRef
  )
  return {
    waypoints: fallbackWaypoints,
    closed: true,
    curved: true,
    bounds: computeBoundsForWaypoints(fallbackWaypoints, pad),
  }
}

const computeSegmentPathRotation = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  baseRotation: number,
  toolProps: StepToolParams
): number => {
  if (!toolProps.handlePathRotation) {
    return baseRotation
  }
  const pathWeight =
    typeof toolProps.pathRotationWeight === 'number' && !Number.isNaN(toolProps.pathRotationWeight)
      ? getNumberInBetween(0, 1, toolProps.pathRotationWeight, 4)
      : 1
  const pathAngle = getAngleRadBetweenTwoPoints(x1, y1, x2, y2) * pathWeight
  return round(baseRotation + pathAngle, 4)
}

export const buildQuickShapeStrokeSamples = (
  waypoints: Array<[number, number]>,
  closed: boolean,
  style: QuickShapeStyle,
  toolProps: StepToolParams
): StrokeSample[] => {
  if (waypoints.length < 2) return []

  const { size, alpha, rotation: baseRotation, aspectRatio } = style
  const samples: StrokeSample[] = []

  const first = waypoints[0]
  const second = waypoints[1]
  const initialRot = computeSegmentPathRotation(
    first[0],
    first[1],
    second[0],
    second[1],
    baseRotation,
    toolProps
  )

  samples.push({
    type: 'start',
    x: round(first[0], 1),
    y: round(first[1], 1),
    midX: round(first[0], 1),
    midY: round(first[1], 1),
    size,
    alpha,
    rotation: initialRot,
    oldSize: size,
    oldAlpha: alpha,
    oldRotation: initialRot,
    oldMidX: round(first[0], 1),
    oldMidY: round(first[1], 1),
    oldX: round(first[0], 1),
    oldY: round(first[1], 1),
    stepLength: 0,
    aspectRatio,
    oldAspectRatio: aspectRatio,
  })

  const maxChunkPx = 24
  let prevRot = initialRot

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    const edgeLen = getDistanceBetweenTwoPoints(a[0], a[1], b[0], b[1], 1)
    if (edgeLen < 0.2) continue

    const segRot = computeSegmentPathRotation(a[0], a[1], b[0], b[1], baseRotation, toolProps)
    const chunks = Math.max(1, Math.ceil(edgeLen / maxChunkPx))
    const chunkLen = round(edgeLen / chunks, 1)

    for (let c = 1; c <= chunks; c++) {
      const t0 = (c - 1) / chunks
      const t1 = c / chunks
      const p0x = round(a[0] + (b[0] - a[0]) * t0, 1)
      const p0y = round(a[1] + (b[1] - a[1]) * t0, 1)
      const p1x = round(a[0] + (b[0] - a[0]) * t1, 1)
      const p1y = round(a[1] + (b[1] - a[1]) * t1, 1)
      const ctrlX = round((p0x + p1x) / 2, 1)
      const ctrlY = round((p0y + p1y) / 2, 1)
      const isFinalStep = !closed && i === waypoints.length - 2 && c === chunks

      samples.push({
        type: isFinalStep ? 'end' : 'move',
        x: p1x,
        y: p1y,
        midX: p1x,
        midY: p1y,
        size,
        alpha,
        rotation: segRot,
        oldSize: size,
        oldAlpha: alpha,
        oldRotation: prevRot,
        oldMidX: p0x,
        oldMidY: p0y,
        oldX: ctrlX,
        oldY: ctrlY,
        stepLength: Math.max(0.5, chunkLen),
        aspectRatio,
        oldAspectRatio: aspectRatio,
      })
      prevRot = segRot
    }
  }

  if (samples.length > 1) {
    samples[samples.length - 1].type = 'end'
  }

  return samples
}
