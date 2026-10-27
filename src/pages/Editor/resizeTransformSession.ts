import { convertAngleDegToRad } from 'utils/mathUtils'
import {
  buildWarpDenseMesh,
  createIdentityMesh,
  getMeshBounds,
  getQuadBounds,
  Point2,
  QuadCorners,
  WarpMesh,
} from 'utils/imageWarp'
import { TransformKind } from './editorTypes'

export const TRANSFORM_KINDS: TransformKind[] = ['resize', 'distort', 'perspective', 'warp']

export const TRANSFORM_KIND_LABELS: Record<TransformKind, string> = {
  resize: 'Resize',
  distort: 'Distort',
  perspective: 'Persp',
  warp: 'Warp',
}

export const isAffineTransformKind = (kind: TransformKind) => kind === 'resize'

export const quadFromAffine = (
  centerX: number,
  centerY: number,
  w: number,
  h: number,
  rDeg: number
): QuadCorners => {
  const rad = convertAngleDegToRad(rDeg)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const hw = w / 2
  const hh = h / 2
  const corners: Array<[number, number]> = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  return corners.map(([lx, ly]) => ({
    x: centerX + lx * cos - ly * sin,
    y: centerY + lx * sin + ly * cos,
  })) as QuadCorners
}

export const cloneCanvasSource = (
  source: CanvasImageSource & { width: number; height: number }
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  ctx.drawImage(source, 0, 0)
  return canvas
}

export const createSessionMeshFromAffine = (
  centerX: number,
  centerY: number,
  w: number,
  h: number,
  rDeg: number
): WarpMesh => {
  const quad = quadFromAffine(centerX, centerY, w, h, rDeg)
  const bounds = getQuadBounds(quad)
  // 3x3 cells => 4x4 control points (16 draggable handles).
  return createIdentityMesh(
    bounds.minX,
    bounds.minY,
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    4,
    4
  )
}

/**
 * Photoshop-style Perspective: the dragged corner's edge partners mirror it —
 * horizontal drag mirrors the other corner on the same horizontal edge,
 * vertical drag mirrors the other corner on the same vertical edge.
 * The opposite corner stays fixed, producing symmetric one-point perspective.
 */
export const applyPerspectiveCornerDrag = (
  quad: QuadCorners,
  cornerIndex: number,
  newPos: Point2
): QuadCorners => {
  const next = quad.map((p) => ({ ...p })) as QuadCorners
  const old = next[cornerIndex]
  const dx = newPos.x - old.x
  const dy = newPos.y - old.y
  next[cornerIndex] = { ...newPos }
  const horizontalPartner = cornerIndex ^ 1
  const verticalPartner = cornerIndex ^ 3
  next[horizontalPartner] = {
    x: next[horizontalPartner].x - dx,
    y: next[horizontalPartner].y,
  }
  next[verticalPartner] = {
    x: next[verticalPartner].x,
    y: next[verticalPartner].y - dy,
  }
  return next
}

export const getTransformBounds = (
  kind: TransformKind,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  quad: QuadCorners | null,
  mesh: WarpMesh | null
) => {
  if (kind === 'distort' || kind === 'perspective') {
    if (quad) return getQuadBounds(quad)
  }
  if (kind === 'warp' && mesh) {
    return getMeshBounds(buildWarpDenseMesh(mesh, 8).points)
  }
  const rad = convertAngleDegToRad(r)
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const boundW = w * cos + h * sin
  const boundH = w * sin + h * cos
  return {
    minX: x - boundW / 2,
    minY: y - boundH / 2,
    maxX: x + boundW / 2,
    maxY: y + boundH / 2,
  }
}
