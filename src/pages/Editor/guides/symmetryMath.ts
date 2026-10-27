import { round } from 'utils/mathUtils'
import type { StrokeSample } from 'utils/canvasUtils'
import { SYMMETRY_SECTOR_COUNTS, type SymmetryMode } from './guideTypes'

const PI = Math.PI
const TWO_PI = PI * 2

export const normalizeAngle = (rad: number): number => {
  let r = rad
  while (r > PI) r -= TWO_PI
  while (r < -PI) r += TWO_PI
  return round(r, 4)
}

const getRotationSnapStepRad = (mode: SymmetryMode): number | null => {
  if (mode === '2' || mode === '4') return PI / 4
  if (mode === '3') return PI / 6
  return null
}

const angleDistance = (a: number, b: number): number => Math.abs(normalizeAngle(a - b))

/** Nearest snap angle; optional max distance (radians) for soft magnetism while dragging */
export const snapGuideRotationRad = (
  mode: SymmetryMode,
  rad: number,
  maxDistanceRad?: number
): number => {
  const step = getRotationSnapStepRad(mode)
  if (!step) return normalizeAngle(rad)
  const normalized = normalizeAngle(rad)
  const centerK = Math.round(normalized / step)
  let best = normalized
  let bestDist = Infinity
  for (let dk = -3; dk <= 3; dk++) {
    const candidate = normalizeAngle((centerK + dk) * step)
    const dist = angleDistance(normalized, candidate)
    if (dist < bestDist) {
      bestDist = dist
      best = candidate
    }
  }
  if (maxDistanceRad !== undefined && bestDist > maxDistanceRad) {
    return normalized
  }
  return best
}

/** Soft magnetism while dragging (2°) */
export const GUIDE_ROTATION_SNAP_TOLERANCE_RAD = (2 * Math.PI) / 180

export const getSymmetrySectorCount = (mode: SymmetryMode): number => {
  if ((SYMMETRY_SECTOR_COUNTS as readonly string[]).includes(mode)) {
    return parseInt(mode, 10)
  }
  return 0
}

const baseRayAngles = (mode: SymmetryMode): number[] => {
  if (mode === 'off') return []
  if (mode === '2') return [-PI / 2]
  const count = getSymmetrySectorCount(mode)
  if (count >= 3) {
    const rays: number[] = []
    for (let k = 0; k < count; k++) {
      rays.push(-PI / 2 + (TWO_PI * k) / count)
    }
    return rays
  }
  return []
}

/**
 * Ray angles (radians) from the origin for drawing guide lines.
 * Mode `2` returns a single direction; the renderer draws the full line through the center.
 */
export const getSymmetryRayAngles = (mode: SymmetryMode, rotationRad = 0): number[] =>
  baseRayAngles(mode).map((angle) => normalizeAngle(angle + rotationRad))

const rotatePointAround = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  rad: number
): [number, number] => {
  const dx = x - cx
  const dy = y - cy
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return [round(cx + dx * cos - dy * sin, 1), round(cy + dx * sin + dy * cos, 1)]
}

const reflectPointAcrossAxis = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  axisAngleRad: number
): [number, number] => {
  const dx = x - cx
  const dy = y - cy
  const twoPhi = axisAngleRad * 2
  const cos2 = Math.cos(twoPhi)
  const sin2 = Math.sin(twoPhi)
  return [round(cx + dx * cos2 + dy * sin2, 1), round(cy + dx * sin2 - dy * cos2, 1)]
}

const rotateStrokeSample = (
  step: StrokeSample,
  cx: number,
  cy: number,
  rad: number
): StrokeSample => {
  if (Math.abs(rad) < 1e-6) return step
  const [x, y] = rotatePointAround(step.x, step.y, cx, cy, rad)
  const [midX, midY] = rotatePointAround(step.midX, step.midY, cx, cy, rad)
  const [oldX, oldY] = rotatePointAround(step.oldX, step.oldY, cx, cy, rad)
  const [oldMidX, oldMidY] = rotatePointAround(step.oldMidX, step.oldMidY, cx, cy, rad)
  return {
    ...step,
    x,
    y,
    midX,
    midY,
    oldX,
    oldY,
    oldMidX,
    oldMidY,
    rotation: normalizeAngle(step.rotation + rad),
    oldRotation: normalizeAngle(step.oldRotation + rad),
  }
}

const reflectStrokeSample = (
  step: StrokeSample,
  cx: number,
  cy: number,
  axisAngleRad: number
): StrokeSample => {
  const [x, y] = reflectPointAcrossAxis(step.x, step.y, cx, cy, axisAngleRad)
  const [midX, midY] = reflectPointAcrossAxis(step.midX, step.midY, cx, cy, axisAngleRad)
  const [oldX, oldY] = reflectPointAcrossAxis(step.oldX, step.oldY, cx, cy, axisAngleRad)
  const [oldMidX, oldMidY] = reflectPointAcrossAxis(
    step.oldMidX,
    step.oldMidY,
    cx,
    cy,
    axisAngleRad
  )
  const twoPhi = axisAngleRad * 2
  return {
    ...step,
    x,
    y,
    midX,
    midY,
    oldX,
    oldY,
    oldMidX,
    oldMidY,
    rotation: normalizeAngle(twoPhi - step.rotation),
    oldRotation: normalizeAngle(twoPhi - step.oldRotation),
  }
}

const expandStepLocal = (
  step: StrokeSample,
  mode: SymmetryMode,
  originX: number,
  originY: number
): StrokeSample[] => {
  const count = getSymmetrySectorCount(mode)
  if (count === 3) {
    const out: StrokeSample[] = [step]
    for (let k = 1; k < 3; k++) {
      out.push(rotateStrokeSample(step, originX, originY, (TWO_PI * k) / 3))
    }
    return out
  }
  if (count >= 4) {
    const out: StrokeSample[] = [step]
    const isEven = count % 2 === 0
    for (let k = 1; k < count; k++) {
      if (isEven && k % 2 === 1) {
        const axisAngle = -PI / 2 + (PI * (k + 1)) / count
        out.push(reflectStrokeSample(step, originX, originY, axisAngle))
      } else {
        const rotAngle = (TWO_PI * k) / count
        out.push(rotateStrokeSample(step, originX, originY, rotAngle))
      }
    }
    return out
  }
  return [step]
}

export const expandStepForSymmetry = (
  step: StrokeSample,
  mode: SymmetryMode,
  originX: number,
  originY: number,
  rotationRad = 0
): StrokeSample[] => {
  if (mode === 'off') return [step]
  if (mode === '2') {
    const axis = normalizeAngle(rotationRad + PI / 2)
    return [step, reflectStrokeSample(step, originX, originY, axis)]
  }
  if (Math.abs(rotationRad) < 1e-6) {
    return expandStepLocal(step, mode, originX, originY)
  }
  const localized = rotateStrokeSample(step, originX, originY, -rotationRad)
  const copies = expandStepLocal(localized, mode, originX, originY)
  return copies.map((copy) => rotateStrokeSample(copy, originX, originY, rotationRad))
}

/** Canvas position for the rotation handle on the first guide ray */
export const getRotationHandleOffset = (
  mode: SymmetryMode,
  rotationRad: number,
  pxScale: number
): { dx: number; dy: number } => {
  const rays = getSymmetryRayAngles(mode, rotationRad)
  const angle = rays[0] ?? -PI / 2 + rotationRad
  const dist = 162 * pxScale
  return {
    dx: Math.cos(angle) * dist,
    dy: Math.sin(angle) * dist,
  }
}

/** Map a touch direction from the origin to a guide rotation value */
export const rotationRadFromOriginToPoint = (
  originX: number,
  originY: number,
  px: number,
  py: number
): number => normalizeAngle(Math.atan2(py - originY, px - originX) + PI / 2)
