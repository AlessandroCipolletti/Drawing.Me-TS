import { describe, expect, it } from 'vitest'
import {
  applyHomography,
  buildWarpDenseMesh,
  catmullRomInterpolate,
  createIdentityMesh,
  evaluateWarpMeshPoint,
  getAlphaBounds,
  getQuadBounds,
  getMeshBounds,
  invertHomography,
  isValidQuad,
  solveHomography,
  type QuadCorners,
} from 'utils/imageWarp'
import {
  applyPerspectiveCornerDrag,
  createSessionMeshFromAffine,
} from 'pages/Editor/resizeTransformSession'

describe('imageWarp', () => {
  it('getQuadBounds wraps corners', () => {
    const quad: QuadCorners = [
      { x: 10, y: 20 },
      { x: 50, y: 15 },
      { x: 48, y: 80 },
      { x: 5, y: 70 },
    ]
    const b = getQuadBounds(quad)
    expect(b.minX).toBe(5)
    expect(b.minY).toBe(15)
    expect(b.maxX).toBe(50)
    expect(b.maxY).toBe(80)
  })

  it('createIdentityMesh produces 4x4 points (3x3 cells) matching rect bounds', () => {
    const mesh = createIdentityMesh(0, 0, 30, 20)
    const b = getMeshBounds(mesh.points)
    expect(b.minX).toBe(0)
    expect(b.minY).toBe(0)
    expect(b.maxX).toBe(30)
    expect(b.maxY).toBe(20)
    expect(mesh.points).toHaveLength(16)
    expect(mesh.cols).toBe(4)
    expect(mesh.rows).toBe(4)
    // Interior handles at the thirds — all draggable via addWarpMeshHandlers.
    expect(mesh.points[5]).toEqual({ x: 10, y: 20 / 3 })
    expect(mesh.points[10]).toEqual({ x: 20, y: 40 / 3 })
  })

  it('getAlphaBounds finds the tight box of non-transparent pixels', () => {
    const width = 6
    const height = 5
    const data = new Uint8ClampedArray(width * height * 4)
    const setAlpha = (x: number, y: number, a: number) => {
      data[(y * width + x) * 4 + 3] = a
    }
    setAlpha(2, 1, 255)
    setAlpha(4, 3, 200)
    setAlpha(0, 0, 2)
    expect(getAlphaBounds({ data, width, height })).toEqual({
      minX: 2,
      minY: 1,
      maxX: 4,
      maxY: 3,
    })
    expect(getAlphaBounds({ data: new Uint8ClampedArray(16), width: 2, height: 2 })).toBeNull()
  })

  it('warp session mesh is 4x4 points so the user gets 3x3 selectable cells', () => {
    const mesh = createSessionMeshFromAffine(50, 50, 30, 30, 0)
    expect(mesh.cols).toBe(4)
    expect(mesh.rows).toBe(4)
    expect(mesh.points).toHaveLength(16)
    expect(mesh.points[0]).toEqual({ x: 35, y: 35 })
    expect(mesh.points[15]).toEqual({ x: 65, y: 65 })
  })

  it('Catmull-Rom passes through its inner control points', () => {
    const p = catmullRomInterpolate(
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 5 },
      { x: 30, y: 0 },
      0
    )
    expect(p).toEqual({ x: 10, y: 5 })
    const end = catmullRomInterpolate(
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 5 },
      { x: 30, y: 0 },
      1
    )
    expect(end).toEqual({ x: 20, y: 5 })
  })

  it('identity warp surface maps uv linearly', () => {
    const mesh = createIdentityMesh(100, 50, 30, 20)
    expect(evaluateWarpMeshPoint(mesh, 0, 0)).toEqual({ x: 100, y: 50 })
    const end = evaluateWarpMeshPoint(mesh, 1, 1)
    expect(end.x).toBeCloseTo(130)
    expect(end.y).toBeCloseTo(70)
    const mid = evaluateWarpMeshPoint(mesh, 0.5, 0.5)
    expect(mid.x).toBeCloseTo(115)
    expect(mid.y).toBeCloseTo(60)
  })

  it('identity warp surface is exactly linear, including near the borders', () => {
    const mesh = createIdentityMesh(10, 20, 30, 40)
    for (const [u, v] of [
      [0.04, 0.04],
      [0.17, 0.5],
      [0.5, 0.83],
      [0.96, 0.31],
      [0.33, 0.97],
    ] as const) {
      const p = evaluateWarpMeshPoint(mesh, u, v)
      expect(p.x).toBeCloseTo(10 + u * 30)
      expect(p.y).toBeCloseTo(20 + v * 40)
    }
    const dense = buildWarpDenseMesh(mesh, 3)
    dense.points.forEach((p, idx) => {
      const i = idx % dense.cols
      const j = Math.floor(idx / dense.cols)
      expect(p.x).toBeCloseTo(10 + (i / (dense.cols - 1)) * 30)
      expect(p.y).toBeCloseTo(20 + (j / (dense.rows - 1)) * 40)
    })
  })

  it('moving the centre control point deforms smoothly and keeps corners fixed', () => {
    const mesh = createIdentityMesh(0, 0, 40, 40, 3, 3)
    mesh.points[4] = { x: 30, y: 20 }
    expect(evaluateWarpMeshPoint(mesh, 0.5, 0.5)).toEqual({ x: 30, y: 20 })
    expect(evaluateWarpMeshPoint(mesh, 0, 0)).toEqual({ x: 0, y: 0 })
    expect(evaluateWarpMeshPoint(mesh, 1, 1)).toEqual({ x: 40, y: 40 })
    const quarter = evaluateWarpMeshPoint(mesh, 0.25, 0.5)
    expect(quarter.x).toBeGreaterThan(10)
    expect(quarter.x).toBeLessThan(30)
  })

  it('homography maps every source corner onto its destination corner', () => {
    const src: QuadCorners = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 0, y: 30 },
    ]
    const dst: QuadCorners = [
      { x: 5, y: 2 },
      { x: 35, y: 6 },
      { x: 42, y: 28 },
      { x: 2, y: 26 },
    ]
    const h = solveHomography(src, dst)
    expect(h).not.toBeNull()
    src.forEach((p, i) => {
      const mapped = applyHomography(h!, p.x, p.y)!
      expect(mapped.x).toBeCloseTo(dst[i].x)
      expect(mapped.y).toBeCloseTo(dst[i].y)
    })
    const roundTrip = applyHomography(invertHomography(h!)!, dst[2].x, dst[2].y)!
    expect(roundTrip.x).toBeCloseTo(src[2].x)
    expect(roundTrip.y).toBeCloseTo(src[2].y)
    expect(isValidQuad(dst)).toBe(true)
    expect(
      isValidQuad([
        { x: 0, y: 0 },
        { x: 40, y: 40 },
        { x: 40, y: 0 },
        { x: 0, y: 40 },
      ])
    ).toBe(false)
  })

  it('perspective drag mirrors edge partners and keeps the opposite corner fixed', () => {
    const quad: QuadCorners = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ]
    const next = applyPerspectiveCornerDrag(quad, 0, { x: 8, y: 6 })
    expect(next[0]).toEqual({ x: 8, y: 6 })
    expect(next[1]).toEqual({ x: 32, y: 0 })
    expect(next[3]).toEqual({ x: 0, y: 34 })
    expect(next[2]).toEqual({ x: 40, y: 40 })
  })

  it('dense mesh has expected size and follows the centre displacement', () => {
    const mesh = createIdentityMesh(0, 0, 40, 40, 3, 3)
    mesh.points[4] = { x: 28, y: 20 }
    const dense = buildWarpDenseMesh(mesh, 4)
    expect(dense.cols).toBe(9)
    expect(dense.rows).toBe(9)
    expect(dense.points[4 * dense.cols + 4]).toEqual({ x: 28, y: 20 })
  })
})
