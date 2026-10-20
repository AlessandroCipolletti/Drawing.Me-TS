import { v4 as uuidv4 } from 'uuid'
import {
  round,
  quadraticBezierValue,
  distanceBetweenTwoPointsGreaterThan,
  getPerc,
} from './mathUtils'
import { colorStringToRgb, compareRgbColorsWithinTollerance, RgbaColor } from './colorsUtils'
import { deepCopy, waitWorkerMessage } from './jsUtils'

import {
  TOOL_FRAME_CIRCLE,
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
}

export interface StrokeToolParams {
  name?: string
  frameType: string | false
  frameImageName?: string | false
  frameImageFile?: HTMLImageElement | ImageBitmap | HTMLCanvasElement | null
  color?: string
  globalCompositeOperation?: GlobalCompositeOperation
  minPxDistanceBetweenFrames: number
  sizeToFramesRatio: number
  size?: number
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
  _rotation: number,
  color = '#000000',
  blur = 0
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

  destinationContext.arc(x, y, size / 2, 0, 2 * PI, true)
  destinationContext.fill()
}

const drawParticlesSprayCircle = (
  destinationContext: ExtendedCanvasContext,
  x: number,
  y: number,
  alpha: number,
  size: number,
  _rotation: number,
  color = '#000000'
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

  const rawCount = size * 4
  const count = Math.min(rawCount, MAX_SPRAY_STAMPS_PER_STEP)
  const stampScale = rawCount > count ? MATH.sqrt(rawCount / count) : 1

  for (let i = 0; i < count; i++) {
    angle = rng() * 2 * PI
    radius = sizeList[MATH.floor(rng() * sizeListL)] + 2
    destinationContext.globalAlpha = Math.max(alpha * (1 - radius / size), 0)
    const w = round((MATH.floor(rng() * (variability + 1)) + 1) * stampScale, 1)
    const h = round((MATH.floor(rng() * (variability + 1)) + 1) * stampScale, 1)
    destinationContext.fillRect(
      round(x + radius * MATH.cos(angle), 1),
      round(y + radius * MATH.sin(angle), 1),
      w,
      h
    )
  }
}

const drawParticlesCircle = (
  destinationContext: ExtendedCanvasContext,
  x: number,
  y: number,
  alpha: number,
  size: number,
  _rotation: number,
  color = '#000000'
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

  const rawCount = size * size
  const count = Math.min(rawCount, MAX_PARTICLE_STAMPS_PER_STEP)
  const stampScale = rawCount > count ? MATH.sqrt(rawCount / count) : 1

  for (let i = 0; i < count; i++) {
    angle = rng() * 2 * PI
    radius = MATH.floor(rng() * (size + 1)) + 1
    width = MATH.floor(rng() * 3) + 1
    const height = width === 2 ? 1 : MATH.floor(rng() * 3) + 1
    destinationContext.fillRect(
      round(x + radius * MATH.cos(angle), 1),
      round(y + radius * MATH.sin(angle), 1),
      round(width * stampScale, 1),
      round(height * stampScale, 1)
    )
  }
}

const drawParticlesRect = (
  destinationContext: ExtendedCanvasContext,
  x: number,
  y: number,
  alpha: number,
  size: number,
  _rotation: number,
  color = '#000000'
) => {
  destinationContext.lastDrawCoordX = x
  destinationContext.lastDrawCoordY = y
  size = Math.max(1, round(size))
  destinationContext.globalAlpha = alpha
  destinationContext.fillStyle = color
  const s2 = size / 2
  const rng = createDeterministicRng(x, y, size, alpha)

  const rawCount = size * (size + 1)
  const count = Math.min(rawCount, MAX_PARTICLE_STAMPS_PER_STEP)
  const dotSize = rawCount > count ? round(MATH.sqrt(rawCount / count), 1) : 1

  for (let i = 0; i < count; i++) {
    destinationContext.fillRect(
      round(x + MATH.floor(rng() * (size + 1)) - s2, 1),
      round(y + MATH.floor(rng() * (size + 1)) - s2, 1),
      dotSize,
      dotSize
    )
  }
}

const drawCanvasImage = (
  destinationContext: ExtendedCanvasContext,
  x: number,
  y: number,
  alpha: number,
  size: number,
  rotation: number
) => {
  const image = destinationContext.toolImageShape.canvas
  destinationContext.lastDrawCoordX = x
  destinationContext.lastDrawCoordY = y
  destinationContext.globalAlpha = alpha
  if (rotation) {
    destinationContext.translate(x, y)
    destinationContext.rotate(rotation)
    destinationContext.drawImage(image, -size / 2, -size / 2, size, size)
    destinationContext.rotate(-rotation)
    destinationContext.translate(-x, -y)
  } else {
    destinationContext.drawImage(
      image,
      MATH.round(x - size / 2),
      MATH.round(y - size / 2),
      size,
      size
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
    blur?: number
  ) => void
> = {
  [TOOL_FRAME_CIRCLE]: drawCircle,
  [TOOL_FRAME_PARTICLES_RECT]: drawParticlesRect,
  [TOOL_FRAME_PARTICLES_CIRCLE]: drawParticlesCircle,
  [TOOL_FRAME_SPRAY_CIRCLE]: drawParticlesSprayCircle,
  [TOOL_FRAME_IMAGE]: drawCanvasImage,
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
  const stepLength = stepData.stepLength
  const minPxDist = tool.minPxDistanceBetweenFrames
  const sizeRatio = tool.sizeToFramesRatio
  const color = tool.color

  let i = 0
  let drewSomething = false
  while (i <= stepLength) {
    const t = getPerc(i, stepLength) / 100
    const frameX = round(quadraticBezierValue(t, stepData.oldMidX, stepData.oldX, stepData.midX), 1)
    const frameY = round(quadraticBezierValue(t, stepData.oldMidY, stepData.oldY, stepData.midY), 1)
    const frameSize = round(stepData.oldSize + deltaSize * t, 1)
    const pxDistanceBetweenFrames = round(Math.max(minPxDist, frameSize * sizeRatio), 1)
    if (
      distanceBetweenTwoPointsGreaterThan(
        destinationContext.lastDrawCoordX,
        destinationContext.lastDrawCoordY,
        frameX,
        frameY,
        pxDistanceBetweenFrames
      )
    ) {
      drawShape(
        destinationContext,
        frameX,
        frameY,
        round(stepData.oldAlpha + deltaAlpha * t, 4),
        frameSize,
        stepData.oldRotation + deltaRotation * t,
        color
      )
      destinationContext.lastDrawCoordX = frameX
      destinationContext.lastDrawCoordY = frameY
      drewSomething = true
    }
    i += 0.5
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
  tool: StrokeToolParams,
  applyCompositeOperation = false
): boolean => {
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
    toolShapesDrawFns[tool.frameType](
      destinationContext,
      sample.x,
      sample.y,
      sample.alpha,
      sample.size,
      sample.rotation,
      tool.color
    )
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
