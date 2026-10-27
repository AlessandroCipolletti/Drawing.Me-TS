import { round } from 'utils/mathUtils'

export type MagicWandPoint = [number, number]

/**
 * Scanline flood-fill matching the bucket worker (`src/utils/workers/bucket.ts`):
 * - When the seed pixel has alpha > 0, compares RGB channels within `tolerance` across all
 *   painted pixels (`alpha > 0`), ignoring alpha buildup differences across brush stamps.
 * - When the seed pixel is transparent (`alpha === 0`), compares all RGBA channels within `tolerance`.
 * - When `boundariesWeakMode` is true, also includes the 1px anti-aliased boundary ring around
 *   the filled region just like the bucket tool.
 */
export const floodFillMagicWandMask = (
  bucketData: Uint8ClampedArray,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  tolerance: number,
  boundariesWeakMode = false,
  outMask?: Uint8Array,
  queue?: Int32Array
): {
  mask: Uint8Array
  minX: number
  minY: number
  maxX: number
  maxY: number
} => {
  const pixelCount = width * height
  const mask = outMask && outMask.length === pixelCount ? outMask : new Uint8Array(pixelCount)
  mask.fill(0)
  if (pixelCount === 0) {
    return { mask, minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }

  const tol = Math.max(0, Math.min(255, Math.round(tolerance)))
  const sx = Math.max(0, Math.min(width - 1, Math.floor(seedX)))
  const sy = Math.max(0, Math.min(height - 1, Math.floor(seedY)))
  const startIdx = (sy * width + sx) * 4
  const bucketDataLength = pixelCount * 4
  const linePxWidth = width * 4

  const targetR = bucketData[startIdx]
  const targetG = bucketData[startIdx + 1]
  const targetB = bucketData[startIdx + 2]
  const targetA = bucketData[startIdx + 3]

  const pixelCompare = (i: number): boolean => {
    if (i < 0 || i >= bucketDataLength) return false
    if (tol >= 255) return true
    const a = bucketData[i + 3]
    if (targetA > 0) {
      if (a === 0) return false
    } else if (Math.abs(targetA - a) > tol) {
      return false
    }
    return (
      Math.abs(targetR - bucketData[i]) <= tol &&
      Math.abs(targetG - bucketData[i + 1]) <= tol &&
      Math.abs(targetB - bucketData[i + 2]) <= tol
    )
  }

  let minX = sx
  let maxX = sx
  let minY = sy
  let maxY = sy

  const markPixel = (p: number) => {
    mask[p] = 1
    const py = Math.trunc(p / width)
    const px = p - py * width
    if (px < minX) minX = px
    if (px > maxX) maxX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py
  }

  const canWeakBoundary = (i: number): boolean =>
    boundariesWeakMode && (targetA === 0 || bucketData[i + 3] > 0)

  const pixelCompareAndSet = (i: number): boolean => {
    if (i < 0 || i >= bucketDataLength) return false
    const p = i >> 2
    if (mask[p] !== 0) return false
    const res = pixelCompare(i)
    if (res || canWeakBoundary(i)) {
      markPixel(p)
    }
    return res
  }

  const stack = queue && queue.length >= pixelCount ? queue : new Int32Array(pixelCount)
  let sp = 0
  stack[sp++] = startIdx

  while (sp > 0) {
    const i = stack[--sp]
    if (pixelCompareAndSet(i)) {
      let leftIndex = i
      let rightIndex = i
      const marginLeft = Math.trunc(i / linePxWidth) * linePxWidth
      const marginRight = marginLeft + linePxWidth

      while (
        marginLeft < rightIndex &&
        marginLeft <= (rightIndex -= 4) &&
        pixelCompareAndSet(rightIndex)
      ) {
        // scan left boundary
      }
      while (
        marginRight > leftIndex &&
        marginRight > (leftIndex += 4) &&
        pixelCompareAndSet(leftIndex)
      ) {
        // scan right boundary
      }

      let inAboveSpan = false
      let inBelowSpan = false
      for (let j = rightIndex; j < leftIndex; j += 4) {
        const above = j - linePxWidth
        if (above >= 0) {
          const aboveP = above >> 2
          if (mask[aboveP] === 0) {
            if (pixelCompare(above)) {
              if (!inAboveSpan) {
                stack[sp++] = above
                inAboveSpan = true
              }
            } else {
              inAboveSpan = false
              if (canWeakBoundary(above)) {
                markPixel(aboveP)
              }
            }
          } else {
            inAboveSpan = false
          }
        }

        const below = j + linePxWidth
        if (below < bucketDataLength) {
          const belowP = below >> 2
          if (mask[belowP] === 0) {
            if (pixelCompare(below)) {
              if (!inBelowSpan) {
                stack[sp++] = below
                inBelowSpan = true
              }
            } else {
              inBelowSpan = false
              if (canWeakBoundary(below)) {
                markPixel(belowP)
              }
            }
          } else {
            inBelowSpan = false
          }
        }
      }
    }
  }

  return { mask, minX, minY, maxX, maxY }
}

const smoothGridCornerLoop = (
  corners: Array<[number, number]>,
  scaleX: number,
  scaleY: number
): MagicWandPoint[] => {
  const n = corners.length
  if (n < 3) return []

  const out: MagicWandPoint[] = []
  const pushUnique = (x: number, y: number) => {
    const rx = round(x, 1)
    const ry = round(y, 1)
    if (out.length > 0) {
      const [lx, ly] = out[out.length - 1]
      if (lx === rx && ly === ry) return
    }
    out.push([rx, ry])
  }

  for (let i = 0; i < n; i++) {
    const [x1, y1] = corners[i]
    const [x2, y2] = corners[(i + 1) % n]
    const dx = x2 - x1
    const dy = y2 - y1
    const segLen = Math.abs(dx) + Math.abs(dy)

    if (segLen <= 2) {
      pushUnique((x1 + x2) * 0.5 * scaleX, (y1 + y2) * 0.5 * scaleY)
    } else {
      const ux = Math.sign(dx)
      const uy = Math.sign(dy)
      const bevel = 0.35
      pushUnique((x1 + ux * bevel) * scaleX, (y1 + uy * bevel) * scaleY)
      pushUnique((x2 - ux * bevel) * scaleX, (y2 - uy * bevel) * scaleY)
    }
  }

  return out
}

export const traceMaskBoundaryRings = (
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  scaleX = 1,
  scaleY = 1,
  visitedBuf?: Uint8Array
): MagicWandPoint[][] => {
  if (width <= 0 || height <= 0) return []
  const stride = width + 1
  const visitedLen = stride * (height + 1)
  const visited =
    visitedBuf && visitedBuf.length >= visitedLen ? visitedBuf : new Uint8Array(visitedLen)

  const minY = Math.max(0, bounds.minY)
  const maxY = Math.min(height - 1, bounds.maxY)
  const minX = Math.max(0, bounds.minX)
  const maxX = Math.min(width - 1, bounds.maxX)

  for (let y = minY; y <= maxY + 1; y++) {
    const rowStart = y * stride + minX
    visited.fill(0, rowStart, rowStart + (maxX - minX + 2))
  }

  const hasOutgoingEdge = (vx: number, vy: number, dir: number): boolean => {
    if (dir === 0) {
      return (
        vx < width &&
        vy < height &&
        mask[vy * width + vx] === 1 &&
        (vy === 0 || mask[(vy - 1) * width + vx] === 0)
      )
    }
    if (dir === 1) {
      return (
        vx > 0 &&
        vy < height &&
        mask[vy * width + vx - 1] === 1 &&
        (vx === width || mask[vy * width + vx] === 0)
      )
    }
    if (dir === 2) {
      return (
        vx > 0 &&
        vy > 0 &&
        mask[(vy - 1) * width + vx - 1] === 1 &&
        (vy === height || mask[vy * width + vx - 1] === 0)
      )
    }
    return (
      vx < width &&
      vy > 0 &&
      mask[(vy - 1) * width + vx] === 1 &&
      (vx === 0 || mask[(vy - 1) * width + vx - 1] === 0)
    )
  }

  const traced: Array<{ ring: MagicWandPoint[]; signedArea2: number }> = []

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if ((visited[y * stride + x] & 1) !== 0 || !hasOutgoingEdge(x, y, 0)) {
        continue
      }

      const corners: Array<[number, number]> = [[x, y]]
      visited[y * stride + x] |= 1
      let vx = x + 1
      let vy = y
      let dir = 0
      let safety = (width + 1) * (height + 1) * 4

      while (!(vx === x && vy === y) && safety-- > 0) {
        const right = (dir + 1) & 3
        const straight = dir
        const left = (dir + 3) & 3
        let nextDir = -1

        for (const cand of [right, straight, left]) {
          if (hasOutgoingEdge(vx, vy, cand) && (visited[vy * stride + vx] & (1 << cand)) === 0) {
            nextDir = cand
            break
          }
        }
        if (nextDir === -1) break

        if (nextDir !== dir) {
          corners.push([vx, vy])
        }
        visited[vy * stride + vx] |= 1 << nextDir
        dir = nextDir
        if (dir === 0) vx++
        else if (dir === 1) vy++
        else if (dir === 2) vx--
        else vy--
      }

      if (dir === 0 && corners.length > 1) {
        corners.shift()
      }
      if (corners.length < 4) continue

      let signedArea2 = 0
      for (let i = 0; i < corners.length; i++) {
        const [x1, y1] = corners[i]
        const [x2, y2] = corners[(i + 1) % corners.length]
        signedArea2 += x1 * y2 - x2 * y1
      }

      // Skip tiny 1-2px interior pinholes (negative signed area)
      if (signedArea2 < 0 && Math.abs(signedArea2) <= 4) {
        continue
      }

      const smoothed = smoothGridCornerLoop(corners, scaleX, scaleY)
      if (smoothed.length >= 3) {
        traced.push({ ring: smoothed, signedArea2 })
      }
    }
  }

  traced.sort((a, b) => b.signedArea2 - a.signedArea2)
  return traced.map((item) => item.ring)
}

interface WorkerWandSession {
  sessionId: number
  workW: number
  workH: number
  scaleX: number
  scaleY: number
  seedGx: number
  seedGy: number
  baseTolerance: number
  boundariesWeakMode: boolean
  rgba: Uint8ClampedArray
  mask: Uint8Array
  queue: Int32Array
  visitedEdges: Uint8Array
  lastTolerance: number
  points: MagicWandPoint[]
  rings: MagicWandPoint[][]
}

let workerSession: WorkerWandSession | null = null

const computeWorkerWandTolerance = (
  session: WorkerWandSession,
  tolerance: number
): { points: MagicWandPoint[]; rings: MagicWandPoint[][]; tolerance: number } => {
  const clampedTol = Math.max(0, Math.min(255, Math.round(tolerance)))
  if (clampedTol === session.lastTolerance && session.points.length >= 3) {
    return { points: session.points, rings: session.rings, tolerance: clampedTol }
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
    session.boundariesWeakMode,
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
  return { points: session.points, rings: session.rings, tolerance: clampedTol }
}

const isDedicatedWorkerScope =
  typeof self !== 'undefined' &&
  typeof document === 'undefined' &&
  typeof self.addEventListener === 'function'

if (isDedicatedWorkerScope) {
  self.addEventListener('message', (event: MessageEvent) => {
    const data = event.data
    if (!data || typeof data.type !== 'string') return

    if (data.type === 'clear') {
      if (workerSession && workerSession.sessionId === data.sessionId) {
        workerSession = null
      }
      return
    }

    if (data.type === 'init') {
      const {
        sessionId,
        workW,
        workH,
        scaleX,
        scaleY,
        seedGx,
        seedGy,
        baseTolerance,
        boundariesWeakMode = true,
        rgba,
        tolerance = 0,
      } = data
      const pixelCount = workW * workH
      workerSession = {
        sessionId,
        workW,
        workH,
        scaleX,
        scaleY,
        seedGx,
        seedGy,
        baseTolerance,
        boundariesWeakMode: boundariesWeakMode !== false,
        rgba,
        mask: new Uint8Array(pixelCount),
        queue: new Int32Array(pixelCount),
        visitedEdges: new Uint8Array((workW + 1) * (workH + 1)),
        lastTolerance: -1,
        points: [],
        rings: [],
      }
      const res = computeWorkerWandTolerance(workerSession, tolerance)
      self.postMessage({
        sessionId,
        tolerance: res.tolerance,
        points: res.points,
        rings: res.rings,
      })
      return
    }

    if (data.type === 'compute') {
      const { sessionId, tolerance } = data
      if (!workerSession || workerSession.sessionId !== sessionId) return
      const res = computeWorkerWandTolerance(workerSession, tolerance)
      self.postMessage({
        sessionId,
        tolerance: res.tolerance,
        points: res.points,
        rings: res.rings,
      })
    }
  })
}
