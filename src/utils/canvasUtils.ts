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
  RgbaColor,
} from './colorsUtils'
import { deepCopy, waitWorkerMessage } from './jsUtils'
import type { StampSpacingMode, ToolConfigProps } from 'pages/Editor/config'

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
  particleDensity?: number
  sprayDensity?: number
  sprayRadiusFactor?: number
  colorJitterHue?: number
  colorJitterSat?: number
  colorJitterLight?: number
  preserveStampRemainder?: boolean
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
    canvas: OffscreenCanvas | HTMLCanvasElement
    context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
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

const particlesLists: Record<number, { numbers: number[]; length: number }> = {}

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

const MAX_SPRAY_STAMPS_PER_STEP = 200
const MAX_PARTICLE_STAMPS_PER_STEP = 160

const initParticlesListFor = (size: number) => {
  particlesLists[size] = {
    numbers: [],
    length: 0,
  }
  for (let i = 1; i <= size; i++) {
    for (let j = 0, l = size + 10 * i; j < l; j++) {
      particlesLists[size].numbers.push(i)
    }
  }
  particlesLists[size].length = particlesLists[size].numbers.length
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
    if (typeof destinationContext.ellipse === 'function') {
      destinationContext.ellipse(x, y, rx, ry, rotation || 0, 0, 2 * PI, true)
    } else {
      destinationContext.translate(x, y)
      if (rotation) destinationContext.rotate(rotation)
      destinationContext.arc(0, 0, rx, 0, 2 * PI, true)
      if (rotation) destinationContext.rotate(-rotation)
      destinationContext.translate(-x, -y)
    }
  } else {
    destinationContext.arc(x, y, size / 2, 0, 2 * PI, true)
  }
  destinationContext.fill()
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
  if (!particlesLists[size]) {
    initParticlesListFor(size)
  }
  const sizeList = particlesLists[size].numbers
  const sizeListL = particlesLists[size].length
  let angle: number
  let radius: number
  const variability = 2
  const rng = createDeterministicRng(x, y, size, alpha)

  const density = tool?.sprayDensity ?? 1
  const radiusFactor = tool?.sprayRadiusFactor ?? 1
  const rawCount = density === 1 ? size * 4 : Math.max(0, round(size * 4 * density, 0))
  const count = Math.min(rawCount, MAX_SPRAY_STAMPS_PER_STEP)
  const stampScale = rawCount > count ? MATH.sqrt(rawCount / count) : 1
  const hasAnisotropy = MATH.abs(aspectRatio - 1) > 0.001
  const cosR = hasAnisotropy && rotation ? MATH.cos(rotation) : 1
  const sinR = hasAnisotropy && rotation ? MATH.sin(rotation) : 0
  const maxR = radiusFactor === 1 ? size : size * radiusFactor

  for (let i = 0; i < count; i++) {
    angle = rng() * 2 * PI
    const baseRadius = sizeList[MATH.floor(rng() * sizeListL)] + 2
    radius = radiusFactor === 1 ? baseRadius : baseRadius * radiusFactor
    destinationContext.globalAlpha = Math.max(alpha * (1 - radius / maxR), 0)
    const w = round((MATH.floor(rng() * (variability + 1)) + 1) * stampScale, 1)
    const h = round((MATH.floor(rng() * (variability + 1)) + 1) * stampScale, 1)
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
  }
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
  const stampScale = rawCount > count ? MATH.sqrt(rawCount / count) : 1
  const hasAnisotropy = MATH.abs(aspectRatio - 1) > 0.001
  const cosR = hasAnisotropy && rotation ? MATH.cos(rotation) : 1
  const sinR = hasAnisotropy && rotation ? MATH.sin(rotation) : 0

  for (let i = 0; i < count; i++) {
    angle = rng() * 2 * PI
    radius = MATH.floor(rng() * (size + 1)) + 1
    width = MATH.floor(rng() * 3) + 1
    const height = width === 2 ? 1 : MATH.floor(rng() * 3) + 1
    if (hasAnisotropy) {
      const lx = radius * MATH.cos(angle)
      const ly = (radius * MATH.sin(angle)) / aspectRatio
      const ox = rotation ? lx * cosR - ly * sinR : lx
      const oy = rotation ? lx * sinR + ly * cosR : ly
      destinationContext.fillRect(
        round(x + ox, 1),
        round(y + oy, 1),
        round(width * stampScale, 1),
        round(height * stampScale, 1)
      )
    } else {
      destinationContext.fillRect(
        round(x + radius * MATH.cos(angle), 1),
        round(y + radius * MATH.sin(angle), 1),
        round(width * stampScale, 1),
        round(height * stampScale, 1)
      )
    }
  }
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
  const dotSize = rawCount > count ? round(MATH.sqrt(rawCount / count), 1) : 1
  const hasAnisotropy = MATH.abs(aspectRatio - 1) > 0.001
  const cosR = hasAnisotropy && rotation ? MATH.cos(rotation) : 1
  const sinR = hasAnisotropy && rotation ? MATH.sin(rotation) : 0

  for (let i = 0; i < count; i++) {
    if (hasAnisotropy) {
      const lx = MATH.floor(rng() * (size + 1)) - s2
      const ly = (MATH.floor(rng() * (size + 1)) - s2) / aspectRatio
      const ox = rotation ? lx * cosR - ly * sinR : lx
      const oy = rotation ? lx * sinR + ly * cosR : ly
      destinationContext.fillRect(round(x + ox, 1), round(y + oy, 1), dotSize, dotSize)
    } else {
      destinationContext.fillRect(
        round(x + MATH.floor(rng() * (size + 1)) - s2, 1),
        round(y + MATH.floor(rng() * (size + 1)) - s2, 1),
        dotSize,
        dotSize
      )
    }
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
    setImageShapeIfNeeded(destinationContext, tool.frameImageFile, tool.frameImageName, color)
  }
  const image = destinationContext.toolImageShape.canvas
  destinationContext.lastDrawCoordX = x
  destinationContext.lastDrawCoordY = y
  destinationContext.globalAlpha = alpha
  const width = size
  const height =
    MATH.abs(aspectRatio - 1) > 0.001 ? MATH.max(1, round(size / aspectRatio, 1)) : size
  if (rotation) {
    destinationContext.translate(x, y)
    destinationContext.rotate(rotation)
    destinationContext.drawImage(image, -width / 2, -height / 2, width, height)
    destinationContext.rotate(-rotation)
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

const applyDeterministicStampJitter = (
  tool: StrokeToolParams,
  x: number,
  y: number,
  alpha: number,
  size: number,
  rotation: number,
  aspectRatio = 1
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
  const hasColorJitter = Boolean(tool.color && (cHue !== 0 || cSat !== 0 || cLight !== 0))

  let drawRotation = rotOffset !== 0 ? round(rotation + rotOffset, 4) : rotation
  if (jPos === 0 && jSize === 0 && jAlpha === 0 && jRot === 0 && jAspect === 0 && !hasColorJitter) {
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
    drawColor = applyDeterministicColorJitter(drawColor, cHue, cSat, cLight, rng(), rng(), rng())
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
}

const resolveStampDrawParams = (
  tool: StrokeToolParams,
  frameX: number,
  frameY: number,
  frameAlpha: number,
  frameSize: number,
  frameRotation: number,
  frameAspect: number,
  segmentT?: number
): ResolvedStampDrawParams => {
  const [drawX, drawY, jitteredAlpha, jitteredSize, drawRotation, jitteredAspect, drawColor] =
    applyDeterministicStampJitter(
      tool,
      frameX,
      frameY,
      frameAlpha,
      frameSize,
      frameRotation,
      frameAspect
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

  let size = jitteredSize
  let aspect = jitteredAspect
  const scaleX = tool.stampScaleX ?? 1
  const scaleY = tool.stampScaleY ?? 1
  if (scaleX !== 1 || scaleY !== 1) {
    size = Math.max(1, round(size * scaleX, 1))
    aspect = Math.max(0.05, round(aspect * (scaleX / scaleY), 3))
  }

  return {
    x: drawX,
    y: drawY,
    alpha,
    size,
    rotation: drawRotation,
    aspect,
    color: drawColor,
    blur: tool.stampBlur || 0,
    compositeOp: tool.stampCompositeOperation,
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
  if (stamp.compositeOp) {
    const prevOp = destinationContext.globalCompositeOperation
    destinationContext.globalCompositeOperation = stamp.compositeOp
    drawShape(
      destinationContext,
      stamp.x,
      stamp.y,
      stamp.alpha,
      stamp.size,
      stamp.rotation,
      stamp.color,
      stamp.blur,
      stamp.aspect,
      tool
    )
    destinationContext.globalCompositeOperation = prevOp
  } else {
    drawShape(
      destinationContext,
      stamp.x,
      stamp.y,
      stamp.alpha,
      stamp.size,
      stamp.rotation,
      stamp.color,
      stamp.blur,
      stamp.aspect,
      tool
    )
  }
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

  let i = 0
  let drewSomething = false
  let evaluatedEnd = false
  while (i <= stepLength) {
    if (i === stepLength) evaluatedEnd = true
    const t = getPerc(i, stepLength) / 100
    const frameX = round(quadraticBezierValue(t, stepData.oldMidX, stepData.oldX, stepData.midX), 1)
    const frameY = round(quadraticBezierValue(t, stepData.oldMidY, stepData.oldY, stepData.midY), 1)
    const frameSize = round(stepData.oldSize + deltaSize * t, 1)
    const pxDistanceBetweenFrames = isFixedSpacing
      ? fixedSpacingPx
      : round(Math.max(minPxDist, frameSize * sizeRatio), 1)
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
      const stamp = resolveStampDrawParams(
        tool,
        frameX,
        frameY,
        frameAlpha,
        frameSize,
        frameRotation,
        frameAspect,
        t
      )
      invokeStampDraw(drawShape, destinationContext, stamp, tool)
      destinationContext.lastDrawCoordX = frameX
      destinationContext.lastDrawCoordY = frameY
      drewSomething = true
    }
    i += stepInc
    if (tool.preserveStampRemainder && !evaluatedEnd && i > stepLength && stepLength > 0) {
      i = stepLength
    }
  }

  return drewSomething
}

/**
 * Single agnostic numeric stroke renderer used for both local pointer input
 * and remote PeerJS coworker strokes.
 */
export const drawStrokeSample = (
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
    setImageShapeIfNeeded(destinationContext, tool.frameImageFile, tool.frameImageName, tool.color)
  }
  if (sample.type === 'start') {
    const stamp = resolveStampDrawParams(
      tool,
      sample.x,
      sample.y,
      sample.alpha,
      sample.size,
      sample.rotation,
      sample.aspectRatio ?? 1
    )
    invokeStampDraw(toolShapesDrawFns[tool.frameType], destinationContext, stamp, tool)
    destinationContext.lastDrawCoordX = sample.x
    destinationContext.lastDrawCoordY = sample.y
    return true
  }
  return drawCurvedFunctionLine(destinationContext, sample, tool)
}

export const fillCanvasWithImage = (
  destinationContext: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x = 0,
  y = 0,
  w?: number,
  h?: number,
  rotation?: number
) => {
  destinationContext.clearRect(
    0,
    0,
    destinationContext.canvas.width,
    destinationContext.canvas.height
  )
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

export const setImageShapeIfNeeded = (
  destinationContext: ExtendedCanvasContext,
  image: HTMLImageElement | ImageBitmap | HTMLCanvasElement | null,
  imageName: string | false,
  color = '#000000'
) => {
  if (!image || !imageName) return
  if (
    destinationContext.toolImageShape.frameImageName !== imageName ||
    destinationContext.toolImageShape.color !== color
  ) {
    destinationContext.toolImageShape.frameImageName = imageName
    destinationContext.toolImageShape.color = color
    destinationContext.toolImageShape.canvas.width = image.width
    destinationContext.toolImageShape.canvas.height = image.height
    destinationContext.toolImageShape.context.fillStyle = color
    destinationContext.toolImageShape.context.globalCompositeOperation = 'source-over'
    destinationContext.toolImageShape.context.fillRect(0, 0, image.width, image.height)
    destinationContext.toolImageShape.context.globalCompositeOperation = 'destination-in'
    destinationContext.toolImageShape.context.drawImage(image, 0, 0, image.width, image.height)
  }
}

export const drawMultipleSteps = (
  destinationContext: ExtendedCanvasContext,
  steps: StrokeSample[],
  tool: StrokeToolParams
) => {
  if (tool.frameImageName && tool.frameImageFile) {
    setImageShapeIfNeeded(destinationContext, tool.frameImageFile, tool.frameImageName, tool.color)
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

export const fillWithBucket = (
  destinationContext: CanvasRenderingContext2D,
  x: number,
  y: number,
  fillColorInput: string | RgbaColor,
  canvasWidth: number,
  canvasHeight: number
): false | Promise<void> => {
  const image = destinationContext.getImageData(0, 0, canvasWidth, canvasHeight)

  const i = (MATH.floor(x) + MATH.floor(y) * canvasWidth) * 4
  const linePxWidth = canvasWidth * 4

  const targetColor = {
    r: image.data[i + 0],
    g: image.data[i + 1],
    b: image.data[i + 2],
    a: image.data[i + 3],
  }
  const tolerance =
    targetColor.a < 255 && targetColor.r + targetColor.g + targetColor.b > 0
      ? config.bucketColorsToleranceWithTransparency
      : config.bucketColorsToleranceWithoutTransparency
  const fillColor = { ...colorStringToRgb(fillColorInput) }
  fillColor.a = round((fillColor.a ?? 1) * 255, 0)

  if (
    image.data[i + 3] > 0 &&
    compareRgbColorsWithinTollerance(targetColor, fillColor, tolerance)
  ) {
    return false
  }

  fillColor.a = targetColor.a === 0 ? 255 : 0
  const boundariesWeekMode = getBucketBoundariesWeakMode(targetColor, fillColor)

  const id = uuidv4()
  const worker = getBucketWorker()
  worker.postMessage(
    {
      id,
      bucketData: image.data,
      i,
      linePxWidth,
      targetColor,
      fillColor,
      boundariesWeekMode,
      tolerance,
    },
    [image.data.buffer]
  )
  const width = image.width
  const height = image.height
  return waitWorkerMessage(worker, id).then(({ bucketData }) => {
    destinationContext.putImageData(new ImageData(bucketData, width, height), 0, 0)
  })
}

const bucketColorsHistoryContains = (color: RgbaColor, history: RgbaColor[]) => {
  return !!history.find(
    (c) =>
      !(Math.abs(c.r - color.r) > 1 || Math.abs(c.g - color.g) > 1 || Math.abs(c.b - color.b) > 1)
  )
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
  }
  return context
}

export const init = () => {
  state = deepCopy(initialState)
}

export const remove = () => {
  state = { bucketColorsHistory: [] }
}
