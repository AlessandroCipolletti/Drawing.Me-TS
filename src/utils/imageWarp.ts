export interface Point2 {
  x: number
  y: number
}

/** TL, TR, BR, BL */
export type QuadCorners = [Point2, Point2, Point2, Point2]

export interface WarpMesh {
  cols: number
  rows: number
  points: Point2[]
}

export interface AxisBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export const getQuadBounds = (quad: QuadCorners): AxisBounds => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of quad) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

export const getMeshBounds = (points: Point2[]): AxisBounds => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

const bilinearPoint = (u: number, v: number, q: QuadCorners): Point2 => {
  const [tl, tr, br, bl] = q
  const x = (1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + u * v * br.x + (1 - u) * v * bl.x
  const y = (1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + u * v * br.y + (1 - u) * v * bl.y
  return { x, y }
}

const invertBilinear = (p: Point2, q: QuadCorners, iterations = 8): { u: number; v: number } => {
  let u = 0.5
  let v = 0.5
  for (let i = 0; i < iterations; i++) {
    const pt = bilinearPoint(u, v, q)
    const du = 0.001
    const dv = 0.001
    const ptU = bilinearPoint(u + du, v, q)
    const ptV = bilinearPoint(u, v + dv, q)
    const fx = pt.x - p.x
    const fy = pt.y - p.y
    const dfxDu = (ptU.x - pt.x) / du
    const dfxDv = (ptV.x - pt.x) / dv
    const dfyDu = (ptU.y - pt.y) / du
    const dfyDv = (ptV.y - pt.y) / dv
    const det = dfxDu * dfyDv - dfxDv * dfyDu
    if (Math.abs(det) < 1e-8) break
    const duStep = (fx * dfyDv - fy * dfxDv) / det
    const dvStep = (fy * dfxDu - fx * dfyDu) / det
    u = clamp(u - duStep, 0, 1)
    v = clamp(v - dvStep, 0, 1)
  }
  return { u, v }
}

const sampleBilinearRgba = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): [number, number, number, number] => {
  if (width < 2 || height < 2 || x < 0 || y < 0 || x > width - 1 || y > height - 1) {
    return [0, 0, 0, 0]
  }
  const x0 = Math.min(Math.floor(x), width - 2)
  const y0 = Math.min(Math.floor(y), height - 2)
  const dx = x - x0
  const dy = y - y0
  const i = (y0 * width + x0) * 4
  const i1 = i + 4
  const iW = i + width * 4
  const iW1 = iW + 4
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) {
    const bl = data[i + c]
    const br = data[i1 + c]
    const tl = data[iW + c]
    const tr = data[iW1 + c]
    out[c] = Math.round(
      (1 - dx) * (1 - dy) * bl + dx * (1 - dy) * br + (1 - dx) * dy * tl + dx * dy * tr
    )
  }
  return out
}

const getSourceImageData = (source: CanvasImageSource & { width: number; height: number }) => {
  const w = source.width
  const h = source.height
  const scratch = document.createElement('canvas')
  scratch.width = w
  scratch.height = h
  const ctx = scratch.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d context unavailable')
  ctx.drawImage(source, 0, 0)
  return ctx.getImageData(0, 0, w, h)
}

const pointInTriangle = (p: Point2, a: Point2, b: Point2, c: Point2) => {
  const v0x = c.x - a.x
  const v0y = c.y - a.y
  const v1x = b.x - a.x
  const v1y = b.y - a.y
  const v2x = p.x - a.x
  const v2y = p.y - a.y
  const dot00 = v0x * v0x + v0y * v0y
  const dot01 = v0x * v1x + v0y * v1y
  const dot02 = v0x * v2x + v0y * v2y
  const dot11 = v1x * v1x + v1y * v1y
  const dot12 = v1x * v2x + v1y * v2y
  const inv = 1 / (dot00 * dot11 - dot01 * dot01)
  const u = (dot11 * dot02 - dot01 * dot12) * inv
  const v = (dot00 * dot12 - dot01 * dot02) * inv
  return u >= 0 && v >= 0 && u + v <= 1
}

const invertTriangleAffine = (
  p: Point2,
  dstA: Point2,
  dstB: Point2,
  dstC: Point2,
  srcA: Point2,
  srcB: Point2,
  srcC: Point2
): Point2 | null => {
  const d0x = dstB.x - dstA.x
  const d0y = dstB.y - dstA.y
  const d1x = dstC.x - dstA.x
  const d1y = dstC.y - dstA.y
  const det = d0x * d1y - d0y * d1x
  if (Math.abs(det) < 1e-8) return null
  const px = p.x - dstA.x
  const py = p.y - dstA.y
  const u = (px * d1y - py * d1x) / det
  const v = (py * d0x - px * d0y) / det
  if (u < 0 || v < 0 || u + v > 1) return null
  return {
    x: srcA.x + u * (srcB.x - srcA.x) + v * (srcC.x - srcA.x),
    y: srcA.y + u * (srcB.y - srcA.y) + v * (srcC.y - srcA.y),
  }
}

export interface WarpRenderOptions {
  /** Sample every N pixels (2 = half resolution preview while dragging). */
  pixelStep?: number
  /** Reuse pixels from session snapshot instead of re-uploading the canvas each frame. */
  sourcePixels?: ImageData
  /** Dense-mesh subdivisions per control cell for warp rendering. */
  subdivisionsPerCell?: number
  /**
   * Render the output at this fraction of full size (drag preview only).
   * The caller draws the result scaled back up; commit renders at 1.
   */
  previewScale?: number
  /** Pre-built dense mesh (avoids rebuilding it for bounds + render in one frame). */
  denseMesh?: WarpMesh
}

let warpScratchCanvas: HTMLCanvasElement | null = null
let warpScratchImageData: ImageData | null = null

const acquireWarpCanvas = (width: number, height: number) => {
  const canvas = warpScratchCanvas ?? document.createElement('canvas')
  warpScratchCanvas = canvas
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // The scratch canvas is reused across frames: always start fully transparent,
  // otherwise triangles from the previous drag frame show through as trails.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, width, height)
  return { canvas, ctx }
}

const acquireWarpScratch = (width: number, height: number) => {
  const scratch = acquireWarpCanvas(width, height)
  if (!scratch) return null
  const { canvas, ctx } = scratch
  let imageData = warpScratchImageData
  if (!imageData || imageData.width !== width || imageData.height !== height) {
    imageData = ctx.createImageData(width, height)
    warpScratchImageData = imageData
  } else {
    imageData.data.fill(0)
  }
  return { canvas, ctx, imageData }
}

/** 1D Catmull-Rom spline through p1..p2 (p0/p3 are neighbours), t in [0,1]. */
export const catmullRomInterpolate = (
  p0: Point2,
  p1: Point2,
  p2: Point2,
  p3: Point2,
  t: number
): Point2 => {
  const t2 = t * t
  const t3 = t2 * t
  const axis = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return { x: axis(p0.x, p1.x, p2.x, p3.x), y: axis(p0.y, p1.y, p2.y, p3.y) }
}

const meshPointAt = (mesh: WarpMesh, col: number, row: number): Point2 => {
  const c = Math.max(0, Math.min(mesh.cols - 1, col))
  const r = Math.max(0, Math.min(mesh.rows - 1, row))
  const base = mesh.points[r * mesh.cols + c]
  // Out-of-range neighbours must be linearly extrapolated, not clamped:
  // clamping duplicates the edge point, halves the Catmull-Rom tangent
  // there, and made even an untouched identity mesh bulge at the borders.
  let { x, y } = base
  if (col < 0 || col >= mesh.cols) {
    const edge = mesh.points[r * mesh.cols + (col < 0 ? 0 : mesh.cols - 1)]
    const inner = mesh.points[r * mesh.cols + (col < 0 ? 1 : mesh.cols - 2)]
    const steps = col < 0 ? -col : col - (mesh.cols - 1)
    x += (edge.x - inner.x) * steps
    y += (edge.y - inner.y) * steps
  }
  if (row < 0 || row >= mesh.rows) {
    const edge = mesh.points[(row < 0 ? 0 : mesh.rows - 1) * mesh.cols + c]
    const inner = mesh.points[(row < 0 ? 1 : mesh.rows - 2) * mesh.cols + c]
    const steps = row < 0 ? -row : row - (mesh.rows - 1)
    x += (edge.x - inner.x) * steps
    y += (edge.y - inner.y) * steps
  }
  return { x, y }
}

/**
 * Smooth warp surface: tensor-product Catmull-Rom over the control mesh.
 * Passes exactly through every control point; (u,v) in [0,1] over the source rect.
 */
export const evaluateWarpMeshPoint = (mesh: WarpMesh, u: number, v: number): Point2 => {
  if (mesh.cols < 2 || mesh.rows < 2) return mesh.points[0] ?? { x: 0, y: 0 }
  const gx = clamp(u, 0, 1) * (mesh.cols - 1)
  const gy = clamp(v, 0, 1) * (mesh.rows - 1)
  const cellX = Math.min(Math.floor(gx), mesh.cols - 2)
  const cellY = Math.min(Math.floor(gy), mesh.rows - 2)
  const tx = gx - cellX
  const ty = gy - cellY
  const rowPoints: Point2[] = []
  for (let r = cellY - 1; r <= cellY + 2; r++) {
    rowPoints.push(
      catmullRomInterpolate(
        meshPointAt(mesh, cellX - 1, r),
        meshPointAt(mesh, cellX, r),
        meshPointAt(mesh, cellX + 1, r),
        meshPointAt(mesh, cellX + 2, r),
        tx
      )
    )
  }
  return catmullRomInterpolate(rowPoints[0], rowPoints[1], rowPoints[2], rowPoints[3], ty)
}

/** Densify the control mesh into a smooth triangle-ready grid. */
export const buildWarpDenseMesh = (mesh: WarpMesh, subdivisionsPerCell = 14): WarpMesh => {
  const sub = Math.max(1, Math.floor(subdivisionsPerCell))
  const cols = (mesh.cols - 1) * sub + 1
  const rows = (mesh.rows - 1) * sub + 1
  const points: Point2[] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      points.push(evaluateWarpMeshPoint(mesh, i / (cols - 1), j / (rows - 1)))
    }
  }
  return { cols, rows, points }
}

interface DenseVertex {
  dst: Point2
  src: Point2
}

/**
 * Software-rasterize one dense triangle into the output pixels.
 * Every destination pixel is *assigned* (never composited), and shared edges
 * get identical samples from both neighbours — so there are no Canvas clip /
 * drawImage seams (the thin white grid that used to bake into saved warps).
 * Sampling is premultiplied bilinear to keep alpha edges clean.
 */
const rasterizeWarpTriangle = (
  dstData: Uint8ClampedArray,
  outW: number,
  outH: number,
  srcPixels: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  a: DenseVertex,
  b: DenseVertex,
  c: DenseVertex
) => {
  const det = (b.dst.y - c.dst.y) * (a.dst.x - c.dst.x) + (c.dst.x - b.dst.x) * (a.dst.y - c.dst.y)
  if (Math.abs(det) < 1e-9) return
  const minX = Math.max(0, Math.floor(Math.min(a.dst.x, b.dst.x, c.dst.x)))
  const maxX = Math.min(outW - 1, Math.ceil(Math.max(a.dst.x, b.dst.x, c.dst.x)))
  const minY = Math.max(0, Math.floor(Math.min(a.dst.y, b.dst.y, c.dst.y)))
  const maxY = Math.min(outH - 1, Math.ceil(Math.max(a.dst.y, b.dst.y, c.dst.y)))
  if (minX > maxX || minY > maxY) return
  const dw0dx = (b.dst.y - c.dst.y) / det
  const dw0dy = (c.dst.x - b.dst.x) / det
  const dw1dx = (c.dst.y - a.dst.y) / det
  const dw1dy = (a.dst.x - c.dst.x) / det
  const dsx0 = a.src.x - c.src.x
  const dsy0 = a.src.y - c.src.y
  const dsx1 = b.src.x - c.src.x
  const dsy1 = b.src.y - c.src.y
  const rowStep = srcW * 4
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5
    let w0 = dw0dx * (minX + 0.5 - c.dst.x) + dw0dy * (py - c.dst.y)
    let w1 = dw1dx * (minX + 0.5 - c.dst.x) + dw1dy * (py - c.dst.y)
    let sx = c.src.x + w0 * dsx0 + w1 * dsx1
    let sy = c.src.y + w0 * dsy0 + w1 * dsy1
    const dsxdx = dw0dx * dsx0 + dw1dx * dsx1
    const dsydx = dw0dx * dsy0 + dw1dx * dsy1
    let o = (y * outW + minX) * 4
    for (let x = minX; x <= maxX; x++) {
      const w2 = 1 - w0 - w1
      if (w0 >= -0.001 && w1 >= -0.001 && w2 >= -0.001) {
        // Texture space: image spans 0..srcW, pixel centres at i + 0.5.
        const u = clamp(sx - 0.5, 0, srcW - 1)
        const v = clamp(sy - 0.5, 0, srcH - 1)
        const x0 = Math.min(Math.floor(u), Math.max(0, srcW - 2))
        const y0 = Math.min(Math.floor(v), Math.max(0, srcH - 2))
        const fx = u - x0
        const fy = v - y0
        const i00 = (y0 * srcW + x0) * 4
        const a00 = srcPixels[i00 + 3]
        const a10 = srcPixels[i00 + 7]
        const a01 = srcPixels[i00 + rowStep + 3]
        const a11 = srcPixels[i00 + rowStep + 7]
        if (a00 !== 0 || a10 !== 0 || a01 !== 0 || a11 !== 0) {
          const bw00 = (1 - fx) * (1 - fy)
          const bw10 = fx * (1 - fy)
          const bw01 = (1 - fx) * fy
          const bw11 = fx * fy
          if (a00 === 255 && a10 === 255 && a01 === 255 && a11 === 255) {
            dstData[o] =
              bw00 * srcPixels[i00] +
              bw10 * srcPixels[i00 + 4] +
              bw01 * srcPixels[i00 + rowStep] +
              bw11 * srcPixels[i00 + rowStep + 4]
            dstData[o + 1] =
              bw00 * srcPixels[i00 + 1] +
              bw10 * srcPixels[i00 + 5] +
              bw01 * srcPixels[i00 + rowStep + 1] +
              bw11 * srcPixels[i00 + rowStep + 5]
            dstData[o + 2] =
              bw00 * srcPixels[i00 + 2] +
              bw10 * srcPixels[i00 + 6] +
              bw01 * srcPixels[i00 + rowStep + 2] +
              bw11 * srcPixels[i00 + rowStep + 6]
            dstData[o + 3] = 255
          } else {
            const alpha = bw00 * a00 + bw10 * a10 + bw01 * a01 + bw11 * a11
            if (alpha > 0.5) {
              const p00 = bw00 * a00
              const p10 = bw10 * a10
              const p01 = bw01 * a01
              const p11 = bw11 * a11
              dstData[o] =
                (p00 * srcPixels[i00] +
                  p10 * srcPixels[i00 + 4] +
                  p01 * srcPixels[i00 + rowStep] +
                  p11 * srcPixels[i00 + rowStep + 4]) /
                alpha
              dstData[o + 1] =
                (p00 * srcPixels[i00 + 1] +
                  p10 * srcPixels[i00 + 5] +
                  p01 * srcPixels[i00 + rowStep + 1] +
                  p11 * srcPixels[i00 + rowStep + 5]) /
                alpha
              dstData[o + 2] =
                (p00 * srcPixels[i00 + 2] +
                  p10 * srcPixels[i00 + 6] +
                  p01 * srcPixels[i00 + rowStep + 2] +
                  p11 * srcPixels[i00 + rowStep + 6]) /
                alpha
              dstData[o + 3] = alpha
            }
          }
        }
      }
      w0 += dw0dx
      w1 += dw1dx
      sx += dsxdx
      sy += dsydx
      o += 4
    }
  }
}

const warpQuadPatch = (
  srcData: ImageData,
  dstData: ImageData,
  dstOffsetX: number,
  dstOffsetY: number,
  srcQuad: QuadCorners,
  dstQuad: QuadCorners,
  pixelStep = 1
) => {
  const bounds = getQuadBounds(dstQuad)
  const minX = Math.floor(bounds.minX - dstOffsetX)
  const minY = Math.floor(bounds.minY - dstOffsetY)
  const maxX = Math.ceil(bounds.maxX - dstOffsetX)
  const maxY = Math.ceil(bounds.maxY - dstOffsetY)
  const [stl, str, sbr, sbl] = srcQuad
  const [dtl, dtr, dbr, dbl] = dstQuad

  const step = Math.max(1, Math.floor(pixelStep))
  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      const dp = { x: x + dstOffsetX, y: y + dstOffsetY }
      let srcPt: Point2 | null = null
      if (pointInTriangle(dp, dtl, dtr, dbl) || pointInTriangle(dp, dtr, dbr, dbl)) {
        srcPt =
          invertTriangleAffine(dp, dtl, dtr, dbl, stl, str, sbl) ||
          invertTriangleAffine(dp, dtr, dbr, dbl, str, sbr, sbl)
      }
      if (!srcPt) {
        const uv = invertBilinear(dp, dstQuad)
        if (uv.u >= 0 && uv.u <= 1 && uv.v >= 0 && uv.v <= 1) {
          srcPt = bilinearPoint(uv.u, uv.v, srcQuad)
        }
      }
      if (!srcPt) continue
      if (x < 0 || y < 0 || x >= dstData.width || y >= dstData.height) continue
      const rgba = sampleBilinearRgba(srcData.data, srcData.width, srcData.height, srcPt.x, srcPt.y)
      const o = (y * dstData.width + x) * 4
      dstData.data[o] = rgba[0]
      dstData.data[o + 1] = rgba[1]
      dstData.data[o + 2] = rgba[2]
      dstData.data[o + 3] = rgba[3]
      if (step > 1) {
        for (let dy = 0; dy < step && y + dy <= maxY; dy++) {
          for (let dx = 0; dx < step && x + dx <= maxX; dx++) {
            if (dx === 0 && dy === 0) continue
            const ox = x + dx
            const oy = y + dy
            if (ox < 0 || oy < 0 || ox >= dstData.width || oy >= dstData.height) continue
            const oo = (oy * dstData.width + ox) * 4
            dstData.data[oo] = rgba[0]
            dstData.data[oo + 1] = rgba[1]
            dstData.data[oo + 2] = rgba[2]
            dstData.data[oo + 3] = rgba[3]
          }
        }
      }
    }
  }
}

/** Row-major 3x3 homography mapping src corners onto dst corners, or null if degenerate. */
export const solveHomography = (src: QuadCorners, dst: QuadCorners): number[] | null => {
  const a: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: X, y: Y } = dst[i]
    a.push([x, y, 1, 0, 0, 0, -X * x, -X * y])
    b.push(X)
    a.push([0, 0, 0, x, y, 1, -Y * x, -Y * y])
    b.push(Y)
  }
  const n = 8
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    }
    if (Math.abs(a[pivot][col]) < 1e-10) return null
    ;[a[col], a[pivot]] = [a[pivot], a[col]]
    ;[b[col], b[pivot]] = [b[pivot], b[col]]
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = a[row][col] / a[col][col]
      if (factor === 0) continue
      for (let k = col; k < n; k++) a[row][k] -= factor * a[col][k]
      b[row] -= factor * b[col]
    }
  }
  const h = a.map((row, i) => b[i] / row[i])
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

export const invertHomography = (h: number[]): number[] | null => {
  const [a, b, c, d, e, f, g, i, j] = h
  const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g)
  if (Math.abs(det) < 1e-12) return null
  const inv = 1 / det
  return [
    (e * j - f * i) * inv,
    (c * i - b * j) * inv,
    (b * f - c * e) * inv,
    (f * g - d * j) * inv,
    (a * j - c * g) * inv,
    (c * d - a * f) * inv,
    (d * i - e * g) * inv,
    (b * g - a * i) * inv,
    (a * e - b * d) * inv,
  ]
}

export const applyHomography = (h: number[], x: number, y: number): Point2 | null => {
  const w = h[6] * x + h[7] * y + h[8]
  if (Math.abs(w) < 1e-10) return null
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w }
}

/** True when the quad is convex and non-degenerate (safe for homography / drag). */
export const isValidQuad = (quad: QuadCorners): boolean => {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = quad[i]
    const b = quad[(i + 1) % 4]
    const c = quad[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-6) return false
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/**
 * Distort / Perspective rasterizer: projective homography (the model behind
 * Photoshop Distort and OpenCV warpPerspective). Inverse-map every output
 * pixel through H^-1 and bilinear-sample the source.
 */
export const warpQuad = (
  source: CanvasImageSource & { width: number; height: number },
  srcRect: AxisBounds,
  dstQuad: QuadCorners,
  options: WarpRenderOptions = {}
): HTMLCanvasElement => {
  const previewScale = Math.min(1, Math.max(0.05, options.previewScale ?? 1))
  const pixelStep = previewScale < 1 ? 1 : Math.max(1, Math.floor(options.pixelStep ?? 1))
  const srcW = source.width
  const srcH = source.height
  const srcQuad: QuadCorners = [
    { x: srcRect.minX, y: srcRect.minY },
    { x: srcRect.maxX, y: srcRect.minY },
    { x: srcRect.maxX, y: srcRect.maxY },
    { x: srcRect.minX, y: srcRect.maxY },
  ]
  const bounds = getQuadBounds(dstQuad)
  const outW = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) * previewScale))
  const outH = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) * previewScale))
  const scratch = acquireWarpScratch(outW, outH)
  if (!scratch) {
    const fallback = document.createElement('canvas')
    fallback.width = outW
    fallback.height = outH
    return fallback
  }
  const { canvas: out, ctx } = scratch
  const dstData = scratch.imageData
  const srcData = options.sourcePixels ?? getSourceImageData(source)
  // Homography works in output-pixel space; scale the destination quad into it.
  const scaledDstQuad = dstQuad.map((p) => ({
    x: (p.x - bounds.minX) * previewScale,
    y: (p.y - bounds.minY) * previewScale,
  })) as QuadCorners
  const homography = solveHomography(srcQuad, scaledDstQuad)
  const inverse = homography ? invertHomography(homography) : null
  if (!inverse || !isValidQuad(dstQuad)) {
    warpQuadPatch(srcData, dstData, 0, 0, srcQuad, scaledDstQuad, pixelStep)
    ctx.putImageData(dstData, 0, 0)
    return out
  }
  const [ih0, ih1, ih2, ih3, ih4, ih5, ih6, ih7, ih8] = inverse
  const srcPixels = srcData.data
  const srcDataW = srcData.width
  const dstPixels = dstData.data
  const maxSrcX = srcW - 1
  const maxSrcY = srcH - 1
  for (let oy = 0; oy < outH; oy += pixelStep) {
    // Incremental homography: numerators/denominator advance by a constant per x step.
    let numX = ih1 * oy + ih2
    let numY = ih4 * oy + ih5
    let den = ih7 * oy + ih8
    for (let ox = 0; ox < outW; ox += pixelStep) {
      const stepX = numX
      const stepY = numY
      const stepDen = den
      numX += ih0 * pixelStep
      numY += ih3 * pixelStep
      den += ih6 * pixelStep
      if (Math.abs(stepDen) < 1e-10) continue
      const sx = stepX / stepDen
      const sy = stepY / stepDen
      if (sx < 0 || sy < 0 || sx > maxSrcX || sy > maxSrcY) continue
      const x0 = Math.min(Math.floor(sx), srcDataW - 2)
      const y0 = Math.min(Math.floor(sy), srcData.height - 2)
      if (x0 < 0 || y0 < 0) continue
      const fx = sx - x0
      const fy = sy - y0
      const i00 = (y0 * srcDataW + x0) * 4
      const w00 = (1 - fx) * (1 - fy)
      const w10 = fx * (1 - fy)
      const w01 = (1 - fx) * fy
      const w11 = fx * fy
      const rowStep = srcDataW * 4
      for (let dy = 0; dy < pixelStep && oy + dy < outH; dy++) {
        let o = ((oy + dy) * outW + ox) * 4
        for (let dx = 0; dx < pixelStep && ox + dx < outW; dx++) {
          dstPixels[o] =
            w00 * srcPixels[i00] +
            w10 * srcPixels[i00 + 4] +
            w01 * srcPixels[i00 + rowStep] +
            w11 * srcPixels[i00 + rowStep + 4]
          dstPixels[o + 1] =
            w00 * srcPixels[i00 + 1] +
            w10 * srcPixels[i00 + 5] +
            w01 * srcPixels[i00 + rowStep + 1] +
            w11 * srcPixels[i00 + rowStep + 5]
          dstPixels[o + 2] =
            w00 * srcPixels[i00 + 2] +
            w10 * srcPixels[i00 + 6] +
            w01 * srcPixels[i00 + rowStep + 2] +
            w11 * srcPixels[i00 + rowStep + 6]
          dstPixels[o + 3] =
            w00 * srcPixels[i00 + 3] +
            w10 * srcPixels[i00 + 7] +
            w01 * srcPixels[i00 + rowStep + 3] +
            w11 * srcPixels[i00 + rowStep + 7]
          o += 4
        }
      }
    }
  }
  ctx.putImageData(dstData, 0, 0)
  return out
}

/**
 * Smallest box (inclusive pixel coords) containing pixels with alpha above
 * the threshold, or null when the image is fully transparent. Used to
 * re-tighten the transform session around real pixels on tool switches.
 */
export const getAlphaBounds = (
  imageData: { data: Uint8ClampedArray; width: number; height: number },
  alphaThreshold = 3
): AxisBounds | null => {
  const { data, width, height } = imageData
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4 + 3
    for (let x = 0; x < width; x++) {
      if (data[rowOffset + x * 4] > alphaThreshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY }
}

export const createIdentityMesh = (
  minX: number,
  minY: number,
  width: number,
  height: number,
  cols = 4,
  rows = 4
): WarpMesh => {
  const points: Point2[] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      points.push({
        x: minX + (width * i) / (cols - 1),
        y: minY + (height * j) / (rows - 1),
      })
    }
  }
  return { cols, rows, points }
}

/**
 * Mesh warp (Wolberg-style spline mesh, rendered as dense triangle texture maps):
 * the control grid (4x4 points = 3x3 cells) defines a smooth Catmull-Rom surface; it is
 * densified and each micro-quad is drawn as two affine-mapped triangles.
 */
export const warpMesh = (
  source: CanvasImageSource & { width: number; height: number },
  srcRect: AxisBounds,
  mesh: WarpMesh,
  options: WarpRenderOptions = {}
): HTMLCanvasElement => {
  const previewScale = Math.min(1, Math.max(0.05, options.previewScale ?? 1))
  const subdivisions = options.subdivisionsPerCell ?? 8
  const fullDense = options.denseMesh ?? buildWarpDenseMesh(mesh, subdivisions)
  const bounds = getMeshBounds(fullDense.points)
  const outW = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) * previewScale))
  const outH = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) * previewScale))
  const dense: WarpMesh =
    previewScale < 1
      ? {
          cols: fullDense.cols,
          rows: fullDense.rows,
          points: fullDense.points.map((p) => ({
            x: (p.x - bounds.minX) * previewScale,
            y: (p.y - bounds.minY) * previewScale,
          })),
        }
      : fullDense
  const scratch = acquireWarpScratch(outW, outH)
  if (!scratch) {
    const fallback = document.createElement('canvas')
    fallback.width = outW
    fallback.height = outH
    return fallback
  }
  const { canvas: out, ctx, imageData } = scratch
  const srcData = options.sourcePixels ?? getSourceImageData(source)
  const srcMinX = srcRect.minX
  const srcMinY = srcRect.minY
  const srcWidth = Math.max(1, srcRect.maxX - srcRect.minX)
  const srcHeight = Math.max(1, srcRect.maxY - srcRect.minY)
  // Precompute every dense vertex once (each is shared by up to 6 triangles).
  // Destination vertices are stored directly in output-pixel coordinates.
  const vertices: DenseVertex[] = new Array(dense.cols * dense.rows)
  for (let j = 0; j < dense.rows; j++) {
    for (let i = 0; i < dense.cols; i++) {
      const idx = j * dense.cols + i
      const dstPoint = dense.points[idx]
      vertices[idx] = {
        dst:
          previewScale < 1
            ? dstPoint
            : { x: dstPoint.x - bounds.minX, y: dstPoint.y - bounds.minY },
        src: {
          x: srcMinX + (i / (dense.cols - 1)) * srcWidth,
          y: srcMinY + (j / (dense.rows - 1)) * srcHeight,
        },
      }
    }
  }
  const dstPixels = imageData.data
  for (let j = 0; j < dense.rows - 1; j++) {
    for (let i = 0; i < dense.cols - 1; i++) {
      const tl = vertices[j * dense.cols + i]
      const tr = vertices[j * dense.cols + i + 1]
      const br = vertices[(j + 1) * dense.cols + i + 1]
      const bl = vertices[(j + 1) * dense.cols + i]
      rasterizeWarpTriangle(
        dstPixels,
        outW,
        outH,
        srcData.data,
        srcData.width,
        srcData.height,
        tl,
        tr,
        bl
      )
      rasterizeWarpTriangle(
        dstPixels,
        outW,
        outH,
        srcData.data,
        srcData.width,
        srcData.height,
        tr,
        br,
        bl
      )
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return out
}

export const readSourceImageData = (
  source: CanvasImageSource & { width: number; height: number }
): ImageData => getSourceImageData(source)
