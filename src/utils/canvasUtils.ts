import { v4 as uuidv4 } from 'uuid'
import {
  round,
  quadraticBezierValue,
  distanceBetweenTwoPointsGreaterThan,
  getPerc,
} from './mathUtils'
import {
  colorStringToRgb,
  compareRgbColorsWithinTollerance,
  applyDeterministicColorJitter,
  mixHexColors,
  rgbToHex,
  RgbaColor,
} from './colorsUtils'
import { deepCopy, waitWorkerMessage } from './jsUtils'
import type { ColorVariationMode, StampSpacingMode, ToolConfigProps } from 'pages/Editor/config'

import {
  TOOL_FRAME_CIRCLE,
  TOOL_FRAME_SQUARE,
  TOOL_FRAME_TRIANGLE,
  TOOL_FRAME_PARTICLES_RECT,
  TOOL_FRAME_PARTICLES_CIRCLE,
  TOOL_FRAME_SPRAY_CIRCLE,
  TOOL_FRAME_IMAGE,
} from 'pages/Editor/constants'

const MATH = Math
const PI = MATH.PI

type StrokePhase = 'start' | 'move' | 'end'

/**
 * Plain numeric stroke sample shared identically between:
 * - Local pointer/touch input in the Editor
 * - Offscreen worker step rendering
 * - Toolbar size/alpha live preview
 * - Remote PeerJS coworking stroke packets
 */
export interface StrokeSample {
  type: StrokePhase
  x: number
  y: number
  midX: number
  midY: number
  size: number
  alpha: number
  rotation: number
  oldSize: number
  oldAlpha: number
  oldRotation: number
  oldMidX: number
  oldMidY: number
  oldX: number
  oldY: number
  stepLength: number
  aspectRatio?: number
  oldAspectRatio?: number
  /** Cumulative px travelled from the stroke start up to this sample (cycle colour mode). */
  strokeDistance?: number
  /** Raw stylus pressure 0..1 for this sample (colour pressure dynamics). */
  force?: number
  /** Random rotation offset chosen at the stroke start (Shape Randomized). */
  strokeRotationOffset?: number
  /** Smudge coworking: 0 finger, 1 pen/mouse */
  inputKind?: number
  /** Legacy coworking wire (older ColorDrop builds). */
  colorDropUserTolerance?: number
  colorDropSoftFill?: boolean
}

export interface StrokeToolParams {
  name?: string
  frameType: string | false
  frameImageName?: string | false
  frameImageFile?: HTMLImageElement | ImageBitmap | HTMLCanvasElement | null
  color?: string
  globalCompositeOperation?: GlobalCompositeOperation
  stampCompositeOperation?: GlobalCompositeOperation
  stampSpacingMode?: StampSpacingMode
  stampSpacingFixedPx?: number
  minPxDistanceBetweenFrames: number
  sizeToFramesRatio: number
  size?: number
  jitterPosition?: number
  jitterSize?: number
  jitterAlpha?: number
  jitterRotation?: number
  jitterAspectRatio?: number
  stampRotationOffset?: number
  stampBlur?: number
  stampScaleX?: number
  stampScaleY?: number
  flow?: number
  buildup?: number
  alpha?: number
  maxAlpha?: number
  /** Draw every frame at opacity 1 when the selected opacity is at maxAlpha. */
  opaqueFramesAtMaxAlpha?: boolean
  particleDensity?: number
  sprayDensity?: number
  sprayRadiusFactor?: number
  colorJitterHue?: number
  colorJitterSat?: number
  colorJitterLight?: number
  colorVariationMode?: ColorVariationMode
  colorCycleLengthPx?: number
  secondaryColor?: string
  colorSecondaryMix?: number
  stampCount?: number
  stampCountJitter?: number
  stampScatter?: number
  stampFlipX?: boolean
  stampFlipY?: boolean
  stampFlipAlternate?: boolean
  stampRotationSnap?: number
  stampAlphaThreshold?: number
  sizeCycleAmount?: number
  alphaCycleAmount?: number
  strokeCycleLengthPx?: number
  wobbleAmount?: number
  wobbleLengthPx?: number
  colorPressureHue?: number
  colorPressureSat?: number
  colorPressureLight?: number
  spacingJitter?: number
  stampEdgeBoost?: number
  /** Internal: resolved flip for the stamp currently being drawn. */
  stampFlipResolvedX?: boolean
  stampFlipResolvedY?: boolean
  preserveStampRemainder?: boolean
}

/** Selected opacity is at the tool maximum (the 100% slider), and the tool opts into solid frames. */
export const shouldForceOpaqueFrames = (tool: {
  opaqueFramesAtMaxAlpha?: boolean
  alpha?: number
  maxAlpha?: number
}): boolean => {
  if (!tool.opaqueFramesAtMaxAlpha) return false
  const { alpha, maxAlpha } = tool
  if (typeof alpha !== 'number' || typeof maxAlpha !== 'number') return false
  if (!Number.isFinite(alpha) || !Number.isFinite(maxAlpha)) return false
  return alpha + 0.0005 >= maxAlpha
}

const VALID_COMPOSITE_OPERATIONS = new Set<GlobalCompositeOperation>([
  'source-over',
  'source-in',
  'source-out',
  'source-atop',
  'destination-over',
  'destination-in',
  'destination-out',
  'destination-atop',
  'lighter',
  'copy',
  'xor',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
])

const finiteOr = (val: unknown, fallback: number): number =>
  typeof val === 'number' && Number.isFinite(val) ? val : fallback

const clampNum = (val: number, min: number, max: number): number =>
  val < min ? min : val > max ? max : val

export const sanitizeToolCustomProps = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      continue
    }
    safe[key] = value
  }
  return safe
}

export const normalizeToolDrawParams = <T extends Partial<ToolConfigProps> & StrokeToolParams>(
  tool: T
): T => {
  const mode: StampSpacingMode = tool.stampSpacingMode === 'fixed' ? 'fixed' : 'bySize'
  const validStampGCO: GlobalCompositeOperation | undefined =
    typeof tool.stampCompositeOperation === 'string' &&
    VALID_COMPOSITE_OPERATIONS.has(tool.stampCompositeOperation as GlobalCompositeOperation)
      ? (tool.stampCompositeOperation as GlobalCompositeOperation)
      : undefined
  const rawScaleX = finiteOr(tool.stampScaleX, 1)
  const rawScaleY = finiteOr(tool.stampScaleY, 1)
  const rawSprayRad = finiteOr(tool.sprayRadiusFactor, 1)

  const normalized: T = {
    ...tool,
    minPxDistanceBetweenFrames: Math.max(0.05, finiteOr(tool.minPxDistanceBetweenFrames, 1)),
    sizeToFramesRatio: Math.max(0.001, finiteOr(tool.sizeToFramesRatio, 1)),
    stampSpacingMode: mode,
    stampSpacingFixedPx: Math.max(0.1, finiteOr(tool.stampSpacingFixedPx, 1)),
    jitterPosition: Math.max(0, finiteOr(tool.jitterPosition, 0)),
    jitterSize: Math.max(0, finiteOr(tool.jitterSize, 0)),
    jitterAlpha: Math.max(0, finiteOr(tool.jitterAlpha, 0)),
    jitterRotation: Math.max(0, finiteOr(tool.jitterRotation, 0)),
    jitterAspectRatio: Math.max(0, finiteOr(tool.jitterAspectRatio, 0)),
    stampRotationOffset: finiteOr(tool.stampRotationOffset, 0),
    stampBlur: clampNum(finiteOr(tool.stampBlur, 0), 0, 32),
    stampScaleX: clampNum(rawScaleX > 0 ? rawScaleX : 1, 0.05, 20),
    stampScaleY: clampNum(rawScaleY > 0 ? rawScaleY : 1, 0.05, 20),
    flow: clampNum(finiteOr(tool.flow, 1), 0, 1),
    buildup: clampNum(finiteOr(tool.buildup, 0), 0, 1),
    particleDensity: clampNum(finiteOr(tool.particleDensity, 1), 0, 10),
    sprayDensity: clampNum(finiteOr(tool.sprayDensity, 1), 0, 10),
    sprayRadiusFactor: clampNum(rawSprayRad > 0 ? rawSprayRad : 1, 0.05, 10),
    colorJitterHue: clampNum(finiteOr(tool.colorJitterHue, 0), 0, 180),
    colorJitterSat: clampNum(finiteOr(tool.colorJitterSat, 0), 0, 1),
    colorJitterLight: clampNum(finiteOr(tool.colorJitterLight, 0), 0, 1),
    colorVariationMode: (['off', 'random', 'cycle'] as const).includes(
      tool.colorVariationMode as ColorVariationMode
    )
      ? (tool.colorVariationMode as ColorVariationMode)
      : 'random',
    colorCycleLengthPx: clampNum(finiteOr(tool.colorCycleLengthPx, 240), 10, 5000),
    secondaryColor:
      typeof tool.secondaryColor === 'string' && tool.secondaryColor.startsWith('#')
        ? tool.secondaryColor
        : '',
    colorSecondaryMix: clampNum(finiteOr(tool.colorSecondaryMix, 0), 0, 1),
    stampCount: Math.round(clampNum(finiteOr(tool.stampCount, 1), 1, 8)),
    stampCountJitter: clampNum(finiteOr(tool.stampCountJitter, 0), 0, 1),
    stampScatter: clampNum(finiteOr(tool.stampScatter, 0), 0, 2),
    stampFlipX: Boolean(tool.stampFlipX),
    stampFlipY: Boolean(tool.stampFlipY),
    stampFlipAlternate: Boolean(tool.stampFlipAlternate),
    stampRotationSnap: clampNum(finiteOr(tool.stampRotationSnap, 0), 0, Math.PI),
    stampAlphaThreshold: clampNum(finiteOr(tool.stampAlphaThreshold, 0), 0, 0.95),
    sizeCycleAmount: clampNum(finiteOr(tool.sizeCycleAmount, 0), 0, 0.9),
    alphaCycleAmount: clampNum(finiteOr(tool.alphaCycleAmount, 0), 0, 0.9),
    strokeCycleLengthPx: clampNum(finiteOr(tool.strokeCycleLengthPx, 160), 10, 5000),
    wobbleAmount: clampNum(finiteOr(tool.wobbleAmount, 0), 0, 1),
    wobbleLengthPx: clampNum(finiteOr(tool.wobbleLengthPx, 120), 10, 5000),
    colorPressureHue: clampNum(finiteOr(tool.colorPressureHue, 0), 0, 180),
    colorPressureSat: clampNum(finiteOr(tool.colorPressureSat, 0), 0, 1),
    colorPressureLight: clampNum(finiteOr(tool.colorPressureLight, 0), 0, 1),
    spacingJitter: clampNum(finiteOr(tool.spacingJitter, 0), 0, 1),
    stampEdgeBoost: clampNum(finiteOr(tool.stampEdgeBoost, 0), 0, 2),
    stampCompositeOperation: validStampGCO,
  }

  if ('pathRotationWeight' in tool) {
    normalized.pathRotationWeight = clampNum(finiteOr(tool.pathRotationWeight, 1), 0, 1)
  }
  if ('rotationSmoothing' in tool) {
    normalized.rotationSmoothing = clampNum(finiteOr(tool.rotationSmoothing, 0), 0, 1)
  }
  if ('minAltitudeFactorToHandleRotation' in tool) {
    normalized.minAltitudeFactorToHandleRotation = clampNum(
      finiteOr(tool.minAltitudeFactorToHandleRotation, 0.3),
      0,
      1
    )
  }
  if ('startTaperFactor' in tool) {
    normalized.startTaperFactor = clampNum(finiteOr(tool.startTaperFactor, 0), 0, 1)
  }
  if ('endTaperFactor' in tool) {
    normalized.endTaperFactor = clampNum(finiteOr(tool.endTaperFactor, 1), 0, 1)
  }
  if ('endTaperSizeAmount' in tool) {
    normalized.endTaperSizeAmount = clampNum(finiteOr(tool.endTaperSizeAmount, 0.3), 0, 1)
  }
  if ('endTaperAlphaCurve' in tool) {
    const c = finiteOr(tool.endTaperAlphaCurve, 1)
    normalized.endTaperAlphaCurve = c > 0 ? c : 1
  }
  if ('speedCurve' in tool) {
    const c = finiteOr(tool.speedCurve, 1)
    normalized.speedCurve = c > 0 ? c : 1
  }
  if ('predictedEventsBlend' in tool) {
    normalized.predictedEventsBlend = clampNum(finiteOr(tool.predictedEventsBlend, 1), 0, 1)
  }
  if ('size' in tool && typeof tool.size !== 'undefined') {
    const s = finiteOr(tool.size, 25)
    normalized.size = s > 0 ? s : 25
  }
  if ('alpha' in tool && typeof tool.alpha !== 'undefined') {
    normalized.alpha = clampNum(finiteOr(tool.alpha, 0.3), 0, 1)
  }

  return normalized
}

export interface ExtendedCanvasContext extends CanvasRenderingContext2D {
  lastDrawCoordX: number
  lastDrawCoordY: number
  toolImageShape: {
    frameImageName: string
    color: string
    threshold?: number
    canvas: OffscreenCanvas | HTMLCanvasElement
    context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
    /** Tinted stamp variants keyed by `frameImageName|color` (LRU, see setImageShapeIfNeeded). */
    cache?: Map<string, OffscreenCanvas | HTMLCanvasElement>
    /** Tinted stamps pre-scaled to quantized draw sizes, keyed by tint key + size (LRU). */
    scaledCache?: Map<string, OffscreenCanvas | HTMLCanvasElement>
  }
}

const config = {
  bucketColorsHistorySize: 150,
  bucketColorsToleranceWithTransparency: 24,
  bucketColorsToleranceWithoutTransparency: 4,
}

let state: { bucketColorsHistory: RgbaColor[] } = {
  bucketColorsHistory: [],
}

const initialState = {
  bucketColorsHistory: [] as RgbaColor[],
}

/**
 * Deterministic fast PRNG (mulberry32) seeded from the numeric StrokeSample parameters.
 * Guarantees that local and remote coworker canvases paint 100% identical particle and
 * spray stamps from the same received StrokeSample numbers.
 */
const createDeterministicRng = (x: number, y: number, size: number, alpha: number) => {
  let seed =
    ((MATH.round(x * 100) * 73856093) ^
      (MATH.round(y * 100) * 19349663) ^
      (MATH.round(size * 100) * 83492791) ^
      (MATH.round(alpha * 10000) * 49979693)) >>>
    0
  if (seed === 0) seed = 0x9e3779b9
  return (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = MATH.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + MATH.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Safety valve for extreme custom density. Droplets stay 1–3px either way:
 * enlarging them to stand in for missing stamps reads as a pixelated zoom.
 */
const MAX_SPRAY_STAMPS_PER_STEP = 8192
const MAX_PARTICLE_STAMPS_PER_STEP = 8192

const eachStamp = (count: number, drawOne: () => void) => {
  for (let index = 0; index < count; index++) {
    drawOne()
  }
}

/**
 * Spray radius in 1..size, weighted P(i) ∝ size + 10*i (denser toward the edge).
 * Integer search matches the old expanded table exactly, without an O(size²) allocation
 * that hitched the first time a large size was used.
 */
const sampleSprayBaseRadius = (size: number, unit: number): number => {
  const total = 6 * size * size + 5 * size
  const k = MATH.min(total - 1, MATH.floor(unit * total))
  const b = size + 5
  const cum = (i: number) => 5 * i * i + b * i
  let lo = 1
  let hi = size
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cum(mid) <= k) lo = mid + 1
    else hi = mid
  }
  return lo
}

const drawCircle = (
  destinationContext: ExtendedCanvasContext,
  x: number,
  y: number,
  alpha: number,
  size: number,
  rotation: number,
  color = '#000000',
  blur = 0,
  aspectRatio = 1
) => {
  destinationContext.beginPath()
  destinationContext.fillStyle = color
  destinationContext.globalAlpha = alpha
  destinationContext.lineJoin = 'round'
  destinationContext.lineCap = 'round'
  destinationContext.lastDrawCoordX = x
  destinationContext.lastDrawCoordY = y

  if (blur) {
    destinationContext.shadowColor = color
    destinationContext.shadowBlur = blur
  } else {
    destinationContext.shadowColor = ''
    destinationContext.shadowBlur = 0
  }

  if (MATH.abs(aspectRatio - 1) > 0.001) {
    const rx = size / 2
    const ry = MATH.max(0.5, round(size / (2 * aspectRatio), 2))
    // ellipse() on WebKit builds its damage rect from the unrotated radii, so a
    // vertically tilted oval is clipped until a later stamp repaints that area.
    destinationContext.save()
    destinationContext.translate(x, y)
    if (rotation) destinationContext.rotate(rotation)
    if (rx > 0 && ry !== rx) destinationContext.scale(1, ry / rx)
    destinationContext.arc(0, 0, MATH.max(rx, 0.5), 0, 2 * PI, true)
    destinationContext.fill()
    destinationContext.restore()
  } else {
    destinationContext.arc(x, y, size / 2, 0, 2 * PI, true)
    destinationContext.fill()
  }
  if (blur) {
    destinationContext.shadowColor = ''
    destinationContext.shadowBlur = 0
  }
}

const drawSquare = (
  destinationContext: ExtendedCanvasContext,
  x: number,
  y: number,
  alpha: number,
  size: number,
  rotation: number,
  color = '#000000',
  blur = 0,
  aspectRatio = 1
) => {
  destinationContext.fillStyle = color
  destinationContext.globalAlpha = alpha
  destinationContext.lastDrawCoordX = x
  destinationContext.lastDrawCoordY = y

  if (blur) {
    destinationContext.shadowColor = color
    destinationContext.shadowBlur = blur
  } else {
    destinationContext.shadowColor = ''
    destinationContext.shadowBlur = 0
  }

  const width = size
  const height =
    MATH.abs(aspectRatio - 1) > 0.001 ? MATH.max(1, round(size / aspectRatio, 2)) : size

  if (rotation) {
    destinationContext.translate(x, y)
    destinationContext.rotate(rotation)
    destinationContext.fillRect(
      round(-width / 2, 1),
      round(-height / 2, 1),
      round(width, 1),
      round(height, 1)
    )
    destinationContext.rotate(-rotation)
    destinationContext.translate(-x, -y)
  } else {
    destinationContext.fillRect(
      round(x - width / 2, 1),
      round(y - height / 2, 1),
      round(width, 1),
      round(height, 1)
    )
  }

  if (blur) {
    destinationContext.shadowColor = ''
    destinationContext.shadowBlur = 0
  }
}

const COS_PI_6 = 0.8660254037844386
const SIN_PI_6 = 0.5

const drawEquilateralTriangle = (
  destinationContext: ExtendedCanvasContext,
  x: number,
  y: number,
  alpha: number,
  size: number,
  rotation: number,
  color = '#000000',
  blur = 0,
  aspectRatio = 1
) => {
  destinationContext.beginPath()
  destinationContext.fillStyle = color
  destinationContext.globalAlpha = alpha
  destinationContext.lineJoin = 'round'
  destinationContext.lineCap = 'round'
  destinationContext.lastDrawCoordX = x
  destinationContext.lastDrawCoordY = y

  if (blur) {
    destinationContext.shadowColor = color
    destinationContext.shadowBlur = blur
  } else {
    destinationContext.shadowColor = ''
    destinationContext.shadowBlur = 0
  }

  const rx = size / 2
  const ry =
    MATH.abs(aspectRatio - 1) > 0.001 ? MATH.max(0.5, round(size / (2 * aspectRatio), 2)) : rx

  const localVertices: Array<[number, number]> = [
    [0, -ry],
    [rx * COS_PI_6, ry * SIN_PI_6],
    [-rx * COS_PI_6, ry * SIN_PI_6],
  ]
  const cosR = rotation ? MATH.cos(rotation) : 1
  const sinR = rotation ? MATH.sin(rotation) : 0

  for (let i = 0; i < localVertices.length; i++) {
    const [lx, ly] = localVertices[i]
    const ox = rotation ? lx * cosR - ly * sinR : lx
    const oy = rotation ? lx * sinR + ly * cosR : ly
    const vx = round(x + ox, 1)
    const vy = round(y + oy, 1)
    if (i === 0) {
      destinationContext.moveTo(vx, vy)
    } else {
      destinationContext.lineTo(vx, vy)
    }
  }
  destinationContext.closePath()
  destinationContext.fill()

  if (blur) {
    destinationContext.shadowColor = ''
    destinationContext.shadowBlur = 0
  }
}

const drawParticlesSprayCircle = (
  destinationContext: ExtendedCanvasContext,
  x: number,
  y: number,
  alpha: number,
  size: number,
  rotation: number,
  color = '#000000',
  _blur = 0,
  aspectRatio = 1,
  tool?: StrokeToolParams
) => {
  destinationContext.lastDrawCoordX = x
  destinationContext.lastDrawCoordY = y
  size = Math.max(1, round(size))
  destinationContext.fillStyle = color
  let angle: number
  let radius: number
  const variability = 2
  const rng = createDeterministicRng(x, y, size, alpha)

  const density = tool?.sprayDensity ?? 1
  const radiusFactor = tool?.sprayRadiusFactor ?? 1
  const rawCount = density === 1 ? size * 4 : Math.max(0, round(size * 4 * density, 0))
  const count = Math.min(rawCount, MAX_SPRAY_STAMPS_PER_STEP)
  const hasAnisotropy = MATH.abs(aspectRatio - 1) > 0.001
  const cosR = hasAnisotropy && rotation ? MATH.cos(rotation) : 1
  const sinR = hasAnisotropy && rotation ? MATH.sin(rotation) : 0
  const maxR = radiusFactor === 1 ? size : size * radiusFactor

  return eachStamp(count, () => {
    angle = rng() * 2 * PI
    const baseRadius = sampleSprayBaseRadius(size, rng()) + 2
    radius = radiusFactor === 1 ? baseRadius : baseRadius * radiusFactor
    destinationContext.globalAlpha = Math.max(alpha * (1 - radius / maxR), 0)
    const w = MATH.floor(rng() * (variability + 1)) + 1
    const h = MATH.floor(rng() * (variability + 1)) + 1
    if (hasAnisotropy) {
      const lx = radius * MATH.cos(angle)
      const ly = (radius * MATH.sin(angle)) / aspectRatio
      const ox = rotation ? lx * cosR - ly * sinR : lx
      const oy = rotation ? lx * sinR + ly * cosR : ly
      destinationContext.fillRect(round(x + ox, 1), round(y + oy, 1), w, h)
    } else {
      destinationContext.fillRect(
        round(x + radius * MATH.cos(angle), 1),
        round(y + radius * MATH.sin(angle), 1),
        w,
        h
      )
    }
  })
}

const drawParticlesCircle = (
  destinationContext: ExtendedCanvasContext,
  x: number,
  y: number,
  alpha: number,
  size: number,
  rotation: number,
  color = '#000000',
  _blur = 0,
  aspectRatio = 1,
  tool?: StrokeToolParams
) => {
  destinationContext.lastDrawCoordX = x
  destinationContext.lastDrawCoordY = y
  size = Math.max(1, round(size))
  destinationContext.globalAlpha = alpha
  destinationContext.fillStyle = color
  let angle: number
  let radius: number
  let width: number
  const rng = createDeterministicRng(x, y, size, alpha)

  const density = tool?.particleDensity ?? 1
  const rawCount = density === 1 ? size * size : Math.max(0, round(size * size * density, 0))
  const count = Math.min(rawCount, MAX_PARTICLE_STAMPS_PER_STEP)
  const hasAnisotropy = MATH.abs(aspectRatio - 1) > 0.001
  const cosR = hasAnisotropy && rotation ? MATH.cos(rotation) : 1
  const sinR = hasAnisotropy && rotation ? MATH.sin(rotation) : 0

  return eachStamp(count, () => {
    angle = rng() * 2 * PI
    radius = MATH.floor(rng() * (size + 1)) + 1
    width = MATH.floor(rng() * 3) + 1
    const height = width === 2 ? 1 : MATH.floor(rng() * 3) + 1
    if (hasAnisotropy) {
      const lx = radius * MATH.cos(angle)
      const ly = (radius * MATH.sin(angle)) / aspectRatio
      const ox = rotation ? lx * cosR - ly * sinR : lx
      const oy = rotation ? lx * sinR + ly * cosR : ly
      destinationContext.fillRect(round(x + ox, 1), round(y + oy, 1), width, height)
    } else {
      destinationContext.fillRect(
        round(x + radius * MATH.cos(angle), 1),
        round(y + radius * MATH.sin(angle), 1),
        width,
        height
      )
    }
  })
}

const drawParticlesRect = (
  destinationContext: ExtendedCanvasContext,
  x: number,
  y: number,
  alpha: number,
  size: number,
  rotation: number,
  color = '#000000',
  _blur = 0,
  aspectRatio = 1,
  tool?: StrokeToolParams
) => {
  destinationContext.lastDrawCoordX = x
  destinationContext.lastDrawCoordY = y
  size = Math.max(1, round(size))
  destinationContext.globalAlpha = alpha
  destinationContext.fillStyle = color
  const s2 = size / 2
  const rng = createDeterministicRng(x, y, size, alpha)

  const density = tool?.particleDensity ?? 1
  const rawCount =
    density === 1 ? size * (size + 1) : Math.max(0, round(size * (size + 1) * density, 0))
  const count = Math.min(rawCount, MAX_PARTICLE_STAMPS_PER_STEP)
  const hasAnisotropy = MATH.abs(aspectRatio - 1) > 0.001
  const cosR = hasAnisotropy && rotation ? MATH.cos(rotation) : 1
  const sinR = hasAnisotropy && rotation ? MATH.sin(rotation) : 0

  return eachStamp(count, () => {
    if (hasAnisotropy) {
      const lx = MATH.floor(rng() * (size + 1)) - s2
      const ly = (MATH.floor(rng() * (size + 1)) - s2) / aspectRatio
      const ox = rotation ? lx * cosR - ly * sinR : lx
      const oy = rotation ? lx * sinR + ly * cosR : ly
      destinationContext.fillRect(round(x + ox, 1), round(y + oy, 1), 1, 1)
    } else {
      destinationContext.fillRect(
        round(x + MATH.floor(rng() * (size + 1)) - s2, 1),
        round(y + MATH.floor(rng() * (size + 1)) - s2, 1),
        1,
        1
      )
    }
  })
}

const MAX_SCALED_STAMP_VARIANTS = 24

const quantizeStampSize = (value: number): number => {
  const step = value <= 32 ? 2 : value <= 96 ? 4 : 8
  return Math.max(step, Math.round(value / step) * step)
}

const getScaledTintedStamp = (
  destinationContext: ExtendedCanvasContext,
  tinted: OffscreenCanvas | HTMLCanvasElement,
  width: number,
  height: number
): { canvas: OffscreenCanvas | HTMLCanvasElement; width: number; height: number } | null => {
  const srcW = tinted?.width || 0
  const srcH = tinted?.height || 0
  if (!srcW || !srcH || (srcW <= width * 1.5 && srcH <= height * 1.5)) return null
  const shape = destinationContext.toolImageShape
  const bw = Math.min(srcW, quantizeStampSize(width))
  const bh = Math.max(1, Math.min(srcH, Math.round((bw * height) / Math.max(1, width))))
  if (!shape.scaledCache) shape.scaledCache = new Map()
  const key = `${shape.frameImageName}|${shape.color}|${bw}x${bh}`
  const cached = shape.scaledCache.get(key)
  if (cached) {
    shape.scaledCache.delete(key)
    shape.scaledCache.set(key, cached)
    return { canvas: cached, width: bw, height: bh }
  }
  let canvas: OffscreenCanvas | HTMLCanvasElement | undefined
  try {
    canvas = createOffscreenOrCanvas(bw, bh)
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null
    if (!ctx) return null
    ctx.drawImage(tinted, 0, 0, bw, bh)
  } catch {
    return null
  }
  shape.scaledCache.set(key, canvas)
  while (shape.scaledCache.size > MAX_SCALED_STAMP_VARIANTS) {
    const oldest = shape.scaledCache.keys().next().value as string | undefined
    if (oldest === undefined || oldest === key) break
    shape.scaledCache.delete(oldest)
  }
  return { canvas, width: bw, height: bh }
}

const drawStampImage = (
  destinationContext: ExtendedCanvasContext,
  image: OffscreenCanvas | HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  flipX = false,
  flipY = false
) => {
  if (rotation || flipX || flipY) {
    destinationContext.translate(x, y)
    if (rotation) destinationContext.rotate(rotation)
    if (flipX || flipY) destinationContext.scale(flipX ? -1 : 1, flipY ? -1 : 1)
    destinationContext.drawImage(image, -width / 2, -height / 2, width, height)
    if (flipX || flipY) destinationContext.scale(flipX ? -1 : 1, flipY ? -1 : 1)
    if (rotation) destinationContext.rotate(-rotation)
    destinationContext.translate(-x, -y)
  } else {
    destinationContext.drawImage(
      image,
      MATH.round(x - width / 2),
      MATH.round(y - height / 2),
      width,
      height
    )
  }
}

const drawCanvasImage = (
  destinationContext: ExtendedCanvasContext,
  x: number,
  y: number,
  alpha: number,
  size: number,
  rotation: number,
  color?: string,
  _blur?: number,
  aspectRatio = 1,
  tool?: StrokeToolParams
) => {
  if (
    color &&
    tool?.frameImageFile &&
    tool?.frameImageName &&
    destinationContext.toolImageShape.color !== color
  ) {
    setImageShapeIfNeeded(
      destinationContext,
      tool.frameImageFile,
      tool.frameImageName,
      color,
      tool.stampAlphaThreshold || 0,
      tool.stampEdgeBoost || 0
    )
  }
  const tinted = destinationContext.toolImageShape.canvas
  destinationContext.lastDrawCoordX = x
  destinationContext.lastDrawCoordY = y
  destinationContext.globalAlpha = alpha
  const width = size
  const height =
    MATH.abs(aspectRatio - 1) > 0.001 ? MATH.max(1, round(size / aspectRatio, 1)) : size
  // Draw from a tint pre-scaled to (a quantization of) the stamp size: resampling
  // a 512px soft gradient on every stamp is the dominant cost for dense brushes,
  // while the pre-scaled variant is prepared once per colour/size bucket.
  // The pre-scaled variant is only the resampling source: the stamp is still
  // drawn at the exact interpolated width/height, so pressure/tilt-driven
  // size changes stay continuous instead of snapping to the size buckets.
  let image: OffscreenCanvas | HTMLCanvasElement = tinted
  const scaled = getScaledTintedStamp(destinationContext, tinted, width, height)
  if (scaled) {
    image = scaled.canvas
  }
  drawStampImage(
    destinationContext,
    image,
    x,
    y,
    width,
    height,
    rotation,
    Boolean(tool?.stampFlipResolvedX),
    Boolean(tool?.stampFlipResolvedY)
  )
}

const toolShapesDrawFns: Record<
  string,
  (
    ctx: ExtendedCanvasContext,
    x: number,
    y: number,
    alpha: number,
    size: number,
    rotation: number,
    color?: string,
    blur?: number,
    aspectRatio?: number,
    tool?: StrokeToolParams
  ) => void
> = {
  [TOOL_FRAME_CIRCLE]: drawCircle,
  [TOOL_FRAME_SQUARE]: drawSquare,
  [TOOL_FRAME_TRIANGLE]: drawEquilateralTriangle,
  [TOOL_FRAME_PARTICLES_RECT]: drawParticlesRect,
  [TOOL_FRAME_PARTICLES_CIRCLE]: drawParticlesCircle,
  [TOOL_FRAME_SPRAY_CIRCLE]: drawParticlesSprayCircle,
  [TOOL_FRAME_IMAGE]: drawCanvasImage,
}

const STAMP_COLOR_QUANTUM = 32

const quantizeStampColor = (
  color: string | undefined,
  quantum = STAMP_COLOR_QUANTUM
): string | undefined => {
  if (!color || !color.startsWith('#')) return color
  const { r, g, b } = colorStringToRgb(color)
  const q = (v: number) => Math.min(255, Math.round(v / quantum) * quantum)
  return rgbToHex(q(r), q(g), q(b))
}

/**
 * Triangular cyclic factor in [-1, 1]: -1 at distance 0, +1 after
 * `lengthPx`, back to -1 after `2 * lengthPx`. Continuous factor; the
 * resulting tint is finely quantized so the tint caches stay effective.
 */
export const getColorCycleFactor = (distancePx: number, lengthPx: number): number => {
  const length = Math.max(10, lengthPx || 240)
  const phase = ((((distancePx || 0) / length) % 2) + 2) % 2
  const tri = phase < 1 ? phase : 2 - phase
  return tri * 2 - 1
}

const applyDeterministicStampJitter = (
  tool: StrokeToolParams,
  x: number,
  y: number,
  alpha: number,
  size: number,
  rotation: number,
  aspectRatio = 1,
  strokeDistance = 0,
  force = -1
): [number, number, number, number, number, number, string | undefined] => {
  const jPos = tool.jitterPosition || 0
  const jSize = tool.jitterSize || 0
  const jAlpha = tool.jitterAlpha || 0
  const jRot = tool.jitterRotation || 0
  const jAspect = tool.jitterAspectRatio || 0
  const rotOffset = tool.stampRotationOffset || 0
  const cHue = tool.colorJitterHue || 0
  const cSat = tool.colorJitterSat || 0
  const cLight = tool.colorJitterLight || 0
  const colorMode = tool.colorVariationMode || 'random'
  const hasSecondary = Boolean(
    tool.color && tool.secondaryColor && (tool.colorSecondaryMix || 0) > 0 && colorMode !== 'off'
  )
  const hasColorJitter = Boolean(
    tool.color && colorMode !== 'off' && (cHue !== 0 || cSat !== 0 || cLight !== 0)
  )

  let drawRotation = rotOffset !== 0 ? round(rotation + rotOffset, 4) : rotation
  if (
    jPos === 0 &&
    jSize === 0 &&
    jAlpha === 0 &&
    jRot === 0 &&
    jAspect === 0 &&
    !hasColorJitter &&
    !hasSecondary &&
    !(
      force >= 0 &&
      ((tool.colorPressureHue || 0) !== 0 ||
        (tool.colorPressureSat || 0) !== 0 ||
        (tool.colorPressureLight || 0) !== 0)
    )
  ) {
    return [x, y, alpha, size, drawRotation, aspectRatio, tool.color]
  }
  const rng = createDeterministicRng(x, y, size, alpha)
  let drawX = x
  let drawY = y
  let drawAlpha = alpha
  let drawSize = size
  let drawAspect = aspectRatio
  let drawColor = tool.color

  if (jPos !== 0) {
    const dist = (rng() - 0.5) * 2 * jPos * size
    const angle = rng() * 2 * PI
    drawX = round(x + dist * MATH.cos(angle), 1)
    drawY = round(y + dist * MATH.sin(angle), 1)
  }
  if (jSize !== 0) {
    drawSize = Math.max(1, round(size * (1 + (rng() - 0.5) * 2 * jSize), 1))
  }
  if (jAlpha !== 0) {
    drawAlpha = Math.max(0.001, Math.min(1, round(alpha * (1 + (rng() - 0.5) * 2 * jAlpha), 4)))
  }
  if (jRot !== 0) {
    drawRotation = round(drawRotation + (rng() - 0.5) * 2 * jRot, 4)
  }
  if (jAspect !== 0) {
    drawAspect = Math.max(0.1, round(aspectRatio * (1 + (rng() - 0.5) * 2 * jAspect), 3))
  }
  if (hasColorJitter) {
    if (colorMode === 'cycle') {
      // One scalar drives every channel: the tint sweeps continuously from
      // the lightest to the darkest variation and back along the stroke.
      const u = (getColorCycleFactor(strokeDistance, tool.colorCycleLengthPx || 240) + 1) / 2
      drawColor = applyDeterministicColorJitter(drawColor, cHue, cSat, cLight, u, u, u)
    } else {
      drawColor = applyDeterministicColorJitter(drawColor, cHue, cSat, cLight, rng(), rng(), rng())
    }
    // Image stamps are pre-tinted into a cached canvas per colour: quantize so
    // a stroke reuses cached tints instead of re-tinting per stamp. Cycle mode
    // uses a finer quantum — with its long cycle only the few tints around the
    // current point of the gradient are ever active, so the cache stays hot
    // while the colour still moves smoothly along the stroke.
    if (tool.frameType === TOOL_FRAME_IMAGE) {
      drawColor = quantizeStampColor(drawColor, colorMode === 'cycle' ? 8 : STAMP_COLOR_QUANTUM)
    }
  }
  const pHue = tool.colorPressureHue || 0
  const pSat = tool.colorPressureSat || 0
  const pLight = tool.colorPressureLight || 0
  if (drawColor && force >= 0 && (pHue !== 0 || pSat !== 0 || pLight !== 0)) {
    // Color Pressure: the tint sweeps with stylus pressure inside the stroke.
    const u = Math.max(0, Math.min(1, force))
    const unit = 0.5 + u / 2
    drawColor = applyDeterministicColorJitter(drawColor, pHue, pSat, pLight, unit, unit, unit)
    if (tool.frameType === TOOL_FRAME_IMAGE) {
      drawColor = quantizeStampColor(drawColor, 8)
    }
  }
  if (hasSecondary && drawColor) {
    const uSec =
      colorMode === 'cycle'
        ? (getColorCycleFactor(strokeDistance, tool.colorCycleLengthPx || 240) + 1) / 2
        : rng()
    drawColor = mixHexColors(
      drawColor,
      tool.secondaryColor as string,
      (tool.colorSecondaryMix || 0) * uSec
    )
    if (tool.frameType === TOOL_FRAME_IMAGE && colorMode !== 'cycle') {
      drawColor = quantizeStampColor(drawColor)
    }
  }
  return [drawX, drawY, drawAlpha, drawSize, drawRotation, drawAspect, drawColor]
}

interface ResolvedStampDrawParams {
  x: number
  y: number
  alpha: number
  size: number
  rotation: number
  aspect: number
  color: string | undefined
  blur: number
  compositeOp: GlobalCompositeOperation | undefined
  flipX: boolean
  flipY: boolean
}

const resolveStampDrawParams = (
  tool: StrokeToolParams,
  frameX: number,
  frameY: number,
  frameAlpha: number,
  frameSize: number,
  frameRotation: number,
  frameAspect: number,
  segmentT?: number,
  strokeDistance = 0,
  force = -1
): ResolvedStampDrawParams => {
  const [drawX, drawY, jitteredAlpha, jitteredSize, drawRotation, jitteredAspect, drawColor] =
    applyDeterministicStampJitter(
      tool,
      frameX,
      frameY,
      frameAlpha,
      frameSize,
      frameRotation,
      frameAspect,
      strokeDistance,
      force
    )

  let alpha = jitteredAlpha
  const flow = tool.flow ?? 1
  if (flow !== 1) {
    alpha = flow <= 0 ? 0 : Math.max(0.001, Math.min(1, round(alpha * flow, 4)))
  }
  const buildup = tool.buildup || 0
  if (buildup > 0 && typeof segmentT === 'number') {
    const buildupScale = 1 - buildup * (1 - segmentT)
    alpha = Math.max(0.001, Math.min(1, round(alpha * buildupScale, 4)))
  }
  if (shouldForceOpaqueFrames(tool)) {
    alpha = 1
  }

  let size = jitteredSize
  let aspect = jitteredAspect
  const scaleX = tool.stampScaleX ?? 1
  const scaleY = tool.stampScaleY ?? 1
  if (scaleX !== 1 || scaleY !== 1) {
    size = Math.max(1, round(size * scaleX, 1))
    aspect = Math.max(0.05, round(aspect * (scaleX / scaleY), 3))
  }

  // Stroke-distance dynamics: pulsing size/alpha and a side-to-side wobble.
  const cycleLen = tool.strokeCycleLengthPx || 160
  const cyclePhase = (2 * PI * Math.max(0, strokeDistance)) / cycleLen
  if (tool.sizeCycleAmount) {
    size = Math.max(1, round(size * (1 + tool.sizeCycleAmount * MATH.sin(cyclePhase)), 1))
  }
  if (tool.alphaCycleAmount) {
    alpha = Math.max(
      0.001,
      Math.min(1, round(alpha * (1 + tool.alphaCycleAmount * MATH.sin(cyclePhase)), 4))
    )
  }
  let finalX = drawX
  let finalY = drawY
  if (tool.wobbleAmount) {
    const off =
      MATH.sin((2 * PI * Math.max(0, strokeDistance)) / (tool.wobbleLengthPx || 120)) *
      tool.wobbleAmount *
      size
    finalX = round(drawX - MATH.sin(drawRotation) * off, 1)
    finalY = round(drawY + MATH.cos(drawRotation) * off, 1)
  }
  const snap = tool.stampRotationSnap || 0
  const finalRotation = snap > 0 ? round(Math.round(drawRotation / snap) * snap, 4) : drawRotation
  const alternateFlip = tool.stampFlipAlternate
    ? Math.floor(Math.max(0, strokeDistance) / Math.max(4, frameSize * 0.75)) % 2 === 1
    : false
  return {
    x: finalX,
    y: finalY,
    alpha,
    size,
    rotation: finalRotation,
    aspect,
    color: drawColor,
    blur: tool.stampBlur || 0,
    compositeOp: tool.stampCompositeOperation,
    flipX: Boolean(tool.stampFlipX) !== alternateFlip,
    flipY: Boolean(tool.stampFlipY),
  }
}

const invokeStampDraw = (
  drawShape: (
    ctx: ExtendedCanvasContext,
    x: number,
    y: number,
    alpha: number,
    size: number,
    rotation: number,
    color?: string,
    blur?: number,
    aspectRatio?: number,
    tool?: StrokeToolParams
  ) => void,
  destinationContext: ExtendedCanvasContext,
  stamp: ResolvedStampDrawParams,
  tool: StrokeToolParams
) => {
  if (stamp.alpha <= 0 || !Number.isFinite(stamp.x) || !Number.isFinite(stamp.y)) {
    return
  }
  const drawTool: StrokeToolParams =
    stamp.flipX || stamp.flipY
      ? { ...tool, stampFlipResolvedX: stamp.flipX, stampFlipResolvedY: stamp.flipY }
      : tool
  // Shape Count: several stamps per placement, optionally jittered/scattered.
  const maxCount = Math.max(1, Math.round(tool.stampCount || 1))
  let count = maxCount
  if (maxCount > 1 && (tool.stampCountJitter || 0) > 0) {
    const rngCount = createDeterministicRng(stamp.x, stamp.y, stamp.size, stamp.alpha)
    count = Math.max(
      1,
      Math.round(maxCount - rngCount() * (tool.stampCountJitter || 0) * (maxCount - 1))
    )
  }
  const scatter = tool.stampScatter || 0
  const drawAll = () => {
    for (let i = 0; i < count; i++) {
      let dx = 0
      let dy = 0
      if (i > 0 || scatter > 0) {
        const rng = createDeterministicRng(
          stamp.x + i * 13.7,
          stamp.y - i * 7.3,
          stamp.size,
          stamp.alpha
        )
        if (scatter > 0) {
          dx = round((rng() - 0.5) * 2 * scatter * stamp.size, 1)
          dy = round((rng() - 0.5) * 2 * scatter * stamp.size, 1)
        }
      }
      drawShape(
        destinationContext,
        stamp.x + dx,
        stamp.y + dy,
        stamp.alpha,
        stamp.size,
        stamp.rotation,
        stamp.color,
        stamp.blur,
        stamp.aspect,
        drawTool
      )
    }
  }
  if (stamp.compositeOp) {
    const prevOp = destinationContext.globalCompositeOperation
    destinationContext.globalCompositeOperation = stamp.compositeOp
    drawAll()
    destinationContext.globalCompositeOperation = prevOp
    return
  }
  drawAll()
}

const drawCurvedFunctionLine = (
  destinationContext: ExtendedCanvasContext,
  stepData: StrokeSample,
  tool: StrokeToolParams
): boolean => {
  const drawShape = tool.frameType ? toolShapesDrawFns[tool.frameType] : undefined
  if (!drawShape) {
    return false
  }
  const deltaAlpha = stepData.alpha - stepData.oldAlpha
  const deltaSize = stepData.size - stepData.oldSize
  const deltaRotation = stepData.rotation - stepData.oldRotation
  const oldAspect = stepData.oldAspectRatio ?? 1
  const newAspect = stepData.aspectRatio ?? 1
  const deltaAspect = newAspect - oldAspect
  const stepLength = stepData.stepLength
  if (!Number.isFinite(stepLength) || stepLength < 0) {
    return false
  }
  const minPxDist = tool.minPxDistanceBetweenFrames
  const sizeRatio = tool.sizeToFramesRatio
  const isFixedSpacing = tool.stampSpacingMode === 'fixed'
  const fixedSpacingPx = round(Math.max(minPxDist, tool.stampSpacingFixedPx || 1), 1)
  const effectiveMinDist = isFixedSpacing ? fixedSpacingPx : minPxDist
  const stepInc = tool.preserveStampRemainder
    ? Math.min(0.5, Math.max(0.1, effectiveMinDist / 2))
    : 0.5

  let drewSomething = false
  let evaluatedEnd = false

  const bump = (cursor: number) => {
    let next = cursor + stepInc
    if (tool.preserveStampRemainder && !evaluatedEnd && next > stepLength && stepLength > 0) {
      next = stepLength
    }
    return next
  }

  const run = (cursor: number): boolean => {
    let i = cursor
    while (i <= stepLength) {
      if (i === stepLength) evaluatedEnd = true
      const t = getPerc(i, stepLength) / 100
      const frameX = round(
        quadraticBezierValue(t, stepData.oldMidX, stepData.oldX, stepData.midX),
        1
      )
      const frameY = round(
        quadraticBezierValue(t, stepData.oldMidY, stepData.oldY, stepData.midY),
        1
      )
      const frameSize = round(stepData.oldSize + deltaSize * t, 1)
      let pxDistanceBetweenFrames = isFixedSpacing
        ? fixedSpacingPx
        : round(Math.max(minPxDist, frameSize * sizeRatio), 1)
      if ((tool.spacingJitter || 0) > 0) {
        // Stroke Path Spacing Jitter: each gap is randomized deterministically.
        const rngGap = createDeterministicRng(frameX, frameY, frameSize, tool.spacingJitter || 0)
        pxDistanceBetweenFrames = round(
          Math.max(
            0.5,
            pxDistanceBetweenFrames * (1 + (rngGap() - 0.5) * 2 * (tool.spacingJitter || 0))
          ),
          1
        )
      }
      if (
        distanceBetweenTwoPointsGreaterThan(
          destinationContext.lastDrawCoordX,
          destinationContext.lastDrawCoordY,
          frameX,
          frameY,
          pxDistanceBetweenFrames
        )
      ) {
        const frameAlpha = round(stepData.oldAlpha + deltaAlpha * t, 4)
        const frameRotation = stepData.oldRotation + deltaRotation * t
        const frameAspect = round(oldAspect + deltaAspect * t, 3)
        const stampDistance =
          typeof stepData.strokeDistance === 'number'
            ? Math.max(0, stepData.strokeDistance - stepLength + t * stepLength)
            : t * stepLength
        const stamp = resolveStampDrawParams(
          tool,
          frameX,
          frameY,
          frameAlpha,
          frameSize,
          frameRotation,
          frameAspect,
          t,
          stampDistance,
          stepData.force ?? -1
        )
        invokeStampDraw(drawShape, destinationContext, stamp, tool)
        destinationContext.lastDrawCoordX = frameX
        destinationContext.lastDrawCoordY = frameY
        drewSomething = true
      }
      i = bump(i)
    }
    return drewSomething
  }

  return run(0)
}

/**
 * Single agnostic numeric stroke renderer used for both local pointer input
 * and remote PeerJS coworker strokes.
 */
const drawStrokeSamplePausable = (
  destinationContext: ExtendedCanvasContext,
  sample: StrokeSample,
  rawTool: StrokeToolParams,
  applyCompositeOperation = false
): boolean => {
  const tool = normalizeToolDrawParams(rawTool)
  if (applyCompositeOperation && tool.globalCompositeOperation) {
    destinationContext.globalCompositeOperation = tool.globalCompositeOperation
  }
  if (!tool.frameType || !toolShapesDrawFns[tool.frameType]) {
    return false
  }
  if (tool.frameType === TOOL_FRAME_IMAGE && tool.frameImageFile && tool.frameImageName) {
    setImageShapeIfNeeded(
      destinationContext,
      tool.frameImageFile,
      tool.frameImageName,
      tool.color,
      tool.stampAlphaThreshold || 0,
      tool.stampEdgeBoost || 0
    )
  }
  if (sample.type === 'start') {
    const stamp = resolveStampDrawParams(
      tool,
      sample.x,
      sample.y,
      sample.alpha,
      sample.size,
      sample.rotation,
      sample.aspectRatio ?? 1,
      undefined,
      sample.strokeDistance ?? 0,
      sample.force ?? -1
    )
    invokeStampDraw(toolShapesDrawFns[tool.frameType], destinationContext, stamp, tool)
    destinationContext.lastDrawCoordX = sample.x
    destinationContext.lastDrawCoordY = sample.y
    return true
  }
  return drawCurvedFunctionLine(destinationContext, sample, tool)
}

export const drawStrokeSample = (
  destinationContext: ExtendedCanvasContext,
  sample: StrokeSample,
  rawTool: StrokeToolParams,
  applyCompositeOperation = false
): boolean => drawStrokeSamplePausable(destinationContext, sample, rawTool, applyCompositeOperation)

export const fillCanvasWithImage = (
  destinationContext: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x = 0,
  y = 0,
  w?: number,
  h?: number,
  rotation?: number,
  clearFirst = true
) => {
  if (clearFirst) {
    destinationContext.clearRect(
      0,
      0,
      destinationContext.canvas.width,
      destinationContext.canvas.height
    )
  }
  destinationContext.globalAlpha = 1
  destinationContext.globalCompositeOperation = 'source-over'

  if (rotation && w && h) {
    destinationContext.translate(x + w / 2, y + h / 2)
    destinationContext.rotate(rotation)
    destinationContext.drawImage(image, -w / 2, -h / 2, w, h)
    destinationContext.rotate(-rotation)
    destinationContext.translate(-x - w / 2, -y - h / 2)
  } else {
    if (w && h) {
      destinationContext.drawImage(image, x, y, w, h)
    } else {
      destinationContext.drawImage(image, x, y)
    }
  }
}

const MAX_TINTED_STAMP_VARIANTS = 16

export const setImageShapeIfNeeded = (
  destinationContext: ExtendedCanvasContext,
  image: HTMLImageElement | ImageBitmap | HTMLCanvasElement | null,
  imageName: string | false,
  color = '#000000',
  alphaThreshold = 0,
  edgeBoost = 0
) => {
  if (!image || !imageName) return
  const shape = destinationContext.toolImageShape
  if (
    shape.frameImageName === imageName &&
    shape.color === color &&
    (shape.threshold || 0) === alphaThreshold
  )
    return

  // Per-stamp colour jitter used to re-tint the full stamp canvas on every
  // stamp. Cache tinted variants (LRU) so alternating colours stay cheap.
  const key = `${imageName}|${color}|${alphaThreshold}|${edgeBoost}`
  if (!shape.cache) shape.cache = new Map()
  const cached = shape.cache.get(key)
  if (cached) {
    shape.cache.delete(key)
    shape.cache.set(key, cached)
    shape.canvas = cached
    shape.frameImageName = imageName
    shape.color = color
    shape.threshold = alphaThreshold
    return
  }

  let canvas: OffscreenCanvas | HTMLCanvasElement | undefined
  let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
  try {
    canvas = createOffscreenOrCanvas(image.width, image.height)
    context = canvas.getContext('2d') as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  } catch {
    // Fall through to the single-slot fallback below.
  }
  if (!canvas || !context) {
    // No canvas factory (tests / exotic envs): fall back to the single slot.
    shape.frameImageName = imageName
    shape.color = color
    shape.threshold = alphaThreshold
    shape.canvas.width = image.width
    shape.canvas.height = image.height
    shape.context.fillStyle = color
    shape.context.globalCompositeOperation = 'source-over'
    shape.context.fillRect(0, 0, image.width, image.height)
    shape.context.globalCompositeOperation = 'destination-in'
    shape.context.drawImage(image, 0, 0, image.width, image.height)
    return
  }

  context.fillStyle = color
  context.globalCompositeOperation = 'source-over'
  context.fillRect(0, 0, image.width, image.height)
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(image, 0, 0, image.width, image.height)
  if (edgeBoost > 0) {
    // Burnt/wet edges: semi-transparent rim pixels are reinforced so the
    // stamp edge reads darker than its centre.
    try {
      const pixels = context.getImageData(0, 0, image.width, image.height)
      for (let i = 3; i < pixels.data.length; i += 4) {
        const a = pixels.data[i]
        if (a > 0 && a < 255) {
          pixels.data[i] = Math.min(255, Math.round(a * (1 + edgeBoost * (1 - a / 255))))
        }
      }
      context.putImageData(pixels, 0, 0)
    } catch {
      // Best-effort on exotic canvas backends.
    }
  }
  if (alphaThreshold > 0) {
    // Crisp stamps: pixels below the threshold vanish, the rest go solid.
    try {
      const pixels = context.getImageData(0, 0, image.width, image.height)
      const cut = alphaThreshold * 255
      for (let i = 3; i < pixels.data.length; i += 4) {
        pixels.data[i] = pixels.data[i] < cut ? 0 : 255
      }
      context.putImageData(pixels, 0, 0)
    } catch {
      // Threshold is best-effort (e.g. exotic canvas backends).
    }
  }

  shape.canvas = canvas
  shape.context = context
  shape.frameImageName = imageName
  shape.color = color
  shape.threshold = alphaThreshold
  shape.cache.set(key, canvas)
  while (shape.cache.size > MAX_TINTED_STAMP_VARIANTS) {
    const oldest = shape.cache.keys().next().value as string | undefined
    if (oldest === undefined || oldest === key) break
    shape.cache.delete(oldest)
  }
}

const beginStepBatch = (destinationContext: ExtendedCanvasContext, tool: StrokeToolParams) => {
  if (tool.frameImageName && tool.frameImageFile) {
    setImageShapeIfNeeded(
      destinationContext,
      tool.frameImageFile,
      tool.frameImageName,
      tool.color,
      tool.stampAlphaThreshold || 0,
      tool.stampEdgeBoost || 0
    )
  }

  destinationContext.clearRect(
    0,
    0,
    destinationContext.canvas.width,
    destinationContext.canvas.height
  )
  destinationContext.globalAlpha = 1
  destinationContext.globalCompositeOperation = 'source-over'

  if (tool.globalCompositeOperation && tool.globalCompositeOperation !== 'source-over') {
    destinationContext.fillStyle = tool.color || 'black'
    destinationContext.fillRect(
      0,
      0,
      destinationContext.canvas.width,
      destinationContext.canvas.height
    )
  }
}

export const drawMultipleSteps = (
  destinationContext: ExtendedCanvasContext,
  steps: StrokeSample[],
  tool: StrokeToolParams
) => {
  beginStepBatch(destinationContext, tool)
  for (const step of steps) {
    drawStrokeSample(destinationContext, step, tool, true)
  }
}

let bucketWorker: Worker | null = null
const getBucketWorker = () => {
  if (!bucketWorker) {
    bucketWorker = new Worker(new URL('./workers/bucket.ts', import.meta.url), { type: 'module' })
  }
  return bucketWorker
}

export interface BucketFillOptions {
  userTolerance?: number
  toleranceOverride?: number
  boundariesWeekModeOverride?: boolean
  preserveTransparentPixels?: boolean
}

const computeBucketBaseTolerance = (targetColor: RgbaColor) =>
  (targetColor.a ?? 0) < 255 && targetColor.r + targetColor.g + targetColor.b > 0
    ? config.bucketColorsToleranceWithTransparency
    : config.bucketColorsToleranceWithoutTransparency

export const fillWithBucketAt = (
  writeContext: CanvasRenderingContext2D,
  readContext: CanvasRenderingContext2D,
  x: number,
  y: number,
  fillColorInput: string | RgbaColor,
  canvasWidth: number,
  canvasHeight: number,
  options?: BucketFillOptions
): false | Promise<void> => {
  const fillX = x
  const fillY = y

  const readImage = readContext.getImageData(0, 0, canvasWidth, canvasHeight)
  const writeImage = writeContext.getImageData(0, 0, canvasWidth, canvasHeight)

  const pxX = MATH.min(MATH.max(0, MATH.floor(fillX)), MATH.max(0, canvasWidth - 1))
  const pxY = MATH.min(MATH.max(0, MATH.floor(fillY)), MATH.max(0, canvasHeight - 1))
  const i = (pxX + pxY * canvasWidth) * 4
  const linePxWidth = canvasWidth * 4

  const targetColor = {
    r: readImage.data[i + 0],
    g: readImage.data[i + 1],
    b: readImage.data[i + 2],
    a: readImage.data[i + 3],
  }
  const baseTolerance = computeBucketBaseTolerance(targetColor)
  const userTol =
    typeof options?.userTolerance === 'number'
      ? Math.max(0, Math.min(255, Math.round(options.userTolerance)))
      : 0
  const tolerance =
    typeof options?.toleranceOverride === 'number'
      ? Math.max(0, Math.min(255, Math.round(options.toleranceOverride)))
      : Math.min(255, baseTolerance + userTol)

  const fillColor = { ...colorStringToRgb(fillColorInput) }
  fillColor.a = round((fillColor.a ?? 1) * 255, 0)

  if (
    readImage.data[i + 3] > 0 &&
    compareRgbColorsWithinTollerance(targetColor, fillColor, tolerance)
  ) {
    return false
  }

  fillColor.a = targetColor.a === 0 ? 255 : 0

  const boundariesWeekMode = resolveFillBoundariesWeekMode(
    targetColor,
    fillColor,
    options?.boundariesWeekModeOverride
  )

  const readCopy = new Uint8ClampedArray(readImage.data)
  const writeBefore =
    options?.preserveTransparentPixels === true ? new Uint8ClampedArray(writeImage.data) : null
  const id = uuidv4()
  const worker = getBucketWorker()
  worker.postMessage(
    {
      id,
      bucketData: writeImage.data,
      readData: readCopy,
      i,
      linePxWidth,
      targetColor,
      fillColor,
      boundariesWeekMode,
      tolerance,
    },
    [writeImage.data.buffer, readCopy.buffer]
  )
  const width = writeImage.width
  const height = writeImage.height
  return waitWorkerMessage(worker, id).then(({ bucketData }) => {
    if (writeBefore) {
      for (let p = 3; p < bucketData.length; p += 4) {
        if (writeBefore[p] === 0) {
          bucketData[p - 3] = writeBefore[p - 3]
          bucketData[p - 2] = writeBefore[p - 2]
          bucketData[p - 1] = writeBefore[p - 1]
          bucketData[p] = 0
        }
      }
    }
    writeContext.putImageData(new ImageData(bucketData, width, height), 0, 0)
  })
}

const bucketColorsHistoryContains = (color: RgbaColor, history: RgbaColor[]) => {
  return !!history.find(
    (c) =>
      !(Math.abs(c.r - color.r) > 1 || Math.abs(c.g - color.g) > 1 || Math.abs(c.b - color.b) > 1)
  )
}

const resolveFillBoundariesWeekMode = (
  targetColor: RgbaColor,
  fillColor: RgbaColor,
  explicitOverride?: boolean
): boolean => {
  if (typeof explicitOverride === 'boolean') return explicitOverride
  return getBucketBoundariesWeakMode(targetColor, fillColor)
}

const getBucketBoundariesWeakMode = (targetColor: RgbaColor, fillColor: RgbaColor): boolean => {
  if (targetColor.a === 0) {
    return true
  }
  const target: RgbaColor = { r: targetColor.r, g: targetColor.g, b: targetColor.b }
  const fill: RgbaColor = { r: fillColor.r, g: fillColor.g, b: fillColor.b }
  const boundariesWeekMode = !bucketColorsHistoryContains(target, state.bucketColorsHistory)
  if (!bucketColorsHistoryContains(fill, state.bucketColorsHistory)) {
    state.bucketColorsHistory.push(fill)
    if (state.bucketColorsHistory.length > config.bucketColorsHistorySize) {
      state.bucketColorsHistory.splice(
        0,
        state.bucketColorsHistory.length - config.bucketColorsHistorySize
      )
    }
  }
  return boundariesWeekMode
}

export const getCanvasColorAtPx = (
  destinationContext: CanvasRenderingContext2D,
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number
) => {
  const pxX = MATH.min(MATH.max(0, MATH.floor(x)), MATH.max(0, canvasWidth - 1))
  const pxY = MATH.min(MATH.max(0, MATH.floor(y)), MATH.max(0, canvasHeight - 1))
  const pixelData = destinationContext.getImageData(pxX, pxY, 1, 1).data
  return {
    r: pixelData[0],
    g: pixelData[1],
    b: pixelData[2],
    a: pixelData[3],
  }
}

export const cleanBucketHistory = () => {
  state.bucketColorsHistory = []
}

export const fillCompletely = (
  destinationContext: CanvasRenderingContext2D,
  color: string,
  canvasWidth: number,
  canvasHeight: number
) => {
  destinationContext.fillStyle = color
  destinationContext.globalAlpha = 1
  destinationContext.globalCompositeOperation = 'source-over'
  destinationContext.fillRect(0, 0, canvasWidth, canvasHeight)
}

const createOffscreenOrCanvas = (w: number, h: number): OffscreenCanvas | HTMLCanvasElement => {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h)
  }
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export const getNewContextForCanvas = (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  willReadFrequently = false
): ExtendedCanvasContext => {
  const context = (willReadFrequently
    ? canvas.getContext('2d', { willReadFrequently: true })
    : canvas.getContext('2d')) as unknown as ExtendedCanvasContext
  context.lastDrawCoordX = -1
  context.lastDrawCoordY = -1
  const shapeImageCanvas = createOffscreenOrCanvas(300, 300)
  const shapeImageContext = shapeImageCanvas.getContext('2d') as any
  context.toolImageShape = {
    frameImageName: '',
    color: '',
    canvas: shapeImageCanvas,
    context: shapeImageContext,
    cache: new Map(),
    scaledCache: new Map(),
  }
  return context
}

export const init = () => {
  state = deepCopy(initialState)
}

export const remove = () => {
  state = { bucketColorsHistory: [] }
}
