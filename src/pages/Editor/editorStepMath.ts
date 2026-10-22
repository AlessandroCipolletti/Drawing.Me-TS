import Params from 'main/Params'
import { round, getNumberInBetween } from 'utils/mathUtils'
import { StrokeSample } from 'utils/canvasUtils'
import { TOUCH_TYPE_STYLUS } from 'main/constants'

export interface StepToolParams {
  size: number
  sizeForceFactor?: number
  sizeSpeedFactor?: number
  sizeAltitudeFactor?: number
  sizeTangentialFactor?: number
  alpha: number
  minAlpha: number
  maxAlpha: number
  alphaForceFactor?: number
  alphaSpeedFactor?: number
  alphaAltitudeFactor?: number
  alphaTangentialFactor?: number
  forceCurve?: number
  altitudeCurve?: number
  aspectRatio?: number
  minAspectRatio?: number
  maxAspectRatio?: number
  aspectAltitudeFactor?: number
  aspectForceFactor?: number
  endTaperFactor?: number
  degradeAlphaBySize?: boolean
  handleStylusRotation?: boolean
  handleStylusTwist?: boolean
  handlePathRotation?: boolean
}

export interface StepTouchData {
  type?: string
  touchType?: string
  x: number
  y: number
  midX: number
  midY: number
  force?: number
  tangentialPressure?: number
  speedFactor?: number
  altitudeFactor?: number
  azimuthAngle?: number
  twist?: number
  hasTwist?: boolean
  pathRotation?: number
  stepLength: number
  isNearRuler?: boolean
  canHandleStylusRotation?: boolean
}

export interface StepLastState {
  x?: number
  y?: number
  midX?: number
  midY?: number
  size?: number
  alpha?: number
  rotation?: number
  aspectRatio?: number
  speedFactor?: number
  timeStamp?: number
}

export function getAltitudeFactorFromAngle(angle: number, maxFactor: number): number {
  return getNumberInBetween(0, 1, (1 - angle / (Math.PI / 2)) / maxFactor)
}

export const applyResponseCurve = (value: number, gamma = 1): number => {
  const clamped = getNumberInBetween(0, 1, value, 4)
  if (!gamma || gamma === 1 || clamped <= 0 || clamped >= 1) {
    return clamped
  }
  return round(Math.pow(clamped, gamma), 4)
}

const lowPassSmoothingFactor = (dtSec: number, cutoffHz: number): number => {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  return 1 / (1 + tau / Math.max(0.0005, dtSec))
}

export const applyOneEuroFilter = (
  rawValue: number,
  prevFiltered: number,
  prevDerivative: number,
  dtMs: number,
  stabilization = 0
): [number, number] => {
  const s = getNumberInBetween(0, 1, stabilization, 3)
  if (s <= 0) {
    return [rawValue, 0]
  }
  const dtSec = Math.max(0.001, Math.min(0.1, (dtMs || 8) / 1000))
  const rawDerivative = (rawValue - prevFiltered) / dtSec
  const dAlpha = lowPassSmoothingFactor(dtSec, 1.5)
  const filteredDerivative = prevDerivative + dAlpha * (rawDerivative - prevDerivative)

  const minCutoff = 25 * Math.pow(0.05, s)
  const beta = 0.01 + (1 - s) * 0.08
  const cutoff = minCutoff + beta * Math.abs(filteredDerivative)
  const alpha = lowPassSmoothingFactor(dtSec, cutoff)
  const filtered = round(prevFiltered + alpha * (rawValue - prevFiltered), 1)
  return [filtered, round(filteredDerivative, 2)]
}

export const getStepSize = (toolProps: StepToolParams, touchData: StepTouchData): number => {
  const force = applyResponseCurve(touchData.force || 0, toolProps.forceCurve)
  const altitude = applyResponseCurve(touchData.altitudeFactor || 0, toolProps.altitudeCurve)
  const speed = touchData.speedFactor || 0
  const tangential = touchData.tangentialPressure || 0

  return Math.max(
    1,
    Math.round(
      toolProps.size +
        toolProps.size * (toolProps.sizeForceFactor || 0) * force +
        toolProps.size * (toolProps.sizeSpeedFactor || 0) * speed +
        toolProps.size * (toolProps.sizeAltitudeFactor || 0) * altitude +
        toolProps.size * (toolProps.sizeTangentialFactor || 0) * tangential
    )
  )
}

export const getStepAlpha = (
  toolsProps: StepToolParams,
  touchData: StepTouchData,
  currentSize: number
): number => {
  const force = applyResponseCurve(touchData.force || 0, toolsProps.forceCurve)
  const altitude = applyResponseCurve(touchData.altitudeFactor || 0, toolsProps.altitudeCurve)
  const speed = touchData.speedFactor || 0
  const tangential = touchData.tangentialPressure || 0

  let alpha =
    round(
      toolsProps.alpha +
        force * (toolsProps.alphaForceFactor || 0) +
        speed * (toolsProps.alphaSpeedFactor || 0) +
        altitude * (toolsProps.alphaAltitudeFactor || 0) +
        tangential * (toolsProps.alphaTangentialFactor || 0),
      3
    ) / (toolsProps.degradeAlphaBySize ? currentSize / toolsProps.size : 1)
  alpha = getNumberInBetween(toolsProps.minAlpha, alpha, toolsProps.maxAlpha)
  return alpha
}

export const getStepAspectRatio = (toolProps: StepToolParams, touchData: StepTouchData): number => {
  const baseAspect = toolProps.aspectRatio ?? 1
  const aspectAlt = toolProps.aspectAltitudeFactor || 0
  const aspectForce = toolProps.aspectForceFactor || 0
  if (aspectAlt === 0 && aspectForce === 0 && baseAspect === 1) {
    return 1
  }
  const force = applyResponseCurve(touchData.force || 0, toolProps.forceCurve)
  const altitude = applyResponseCurve(touchData.altitudeFactor || 0, toolProps.altitudeCurve)
  const rawAspect =
    baseAspect + baseAspect * aspectAlt * altitude + baseAspect * aspectForce * force
  const minAspect = toolProps.minAspectRatio ?? 0.2
  const maxAspect = toolProps.maxAspectRatio ?? 5
  return getNumberInBetween(minAspect, rawAspect, maxAspect, 3)
}

export const getStepRotation = (
  toolsProps: StepToolParams,
  touchData: StepTouchData,
  lastStep: StepLastState
): number => {
  let rotation = lastStep.rotation || 0

  if (!touchData.isNearRuler) {
    if (touchData.type === TOUCH_TYPE_STYLUS || touchData.touchType === TOUCH_TYPE_STYLUS) {
      rotation = 0
      const hasStylusTwist = Boolean(
        toolsProps.handleStylusTwist &&
        (touchData.hasTwist || (typeof touchData.twist === 'number' && touchData.twist !== 0))
      )
      if (toolsProps.handleStylusRotation) {
        if (touchData.canHandleStylusRotation) {
          rotation = touchData.azimuthAngle || 0
        } else if (!hasStylusTwist) {
          rotation = lastStep.rotation || 0
        }
      }
      if (hasStylusTwist) {
        rotation += touchData.twist || 0
      }
      if (toolsProps.handlePathRotation) {
        rotation += touchData.pathRotation || 0
      }
    } else if (toolsProps.handlePathRotation) {
      rotation = -(touchData.pathRotation || 0)
    }
  }

  const lastRotation = lastStep.rotation || 0
  let deltaRotation = (rotation - lastRotation) % (Math.PI * 2)
  if (deltaRotation > Math.PI) {
    deltaRotation -= Math.PI * 2
  } else if (deltaRotation < -Math.PI) {
    deltaRotation += Math.PI * 2
  }
  rotation = lastRotation + deltaRotation

  return round(rotation, 4)
}

const getStepStartLineData = (
  toolProps: StepToolParams,
  touchData: StepTouchData
): ['start', number, number, number, number] => {
  const size = getStepSize(toolProps, touchData)
  const hasStylusTwist = Boolean(
    toolProps.handleStylusTwist &&
    (touchData.hasTwist || (typeof touchData.twist === 'number' && touchData.twist !== 0))
  )
  let startRotation = 0
  if (toolProps.handleStylusRotation) {
    startRotation += touchData.azimuthAngle || 0
  }
  if (hasStylusTwist) {
    startRotation += touchData.twist || 0
  }
  return [
    'start',
    size,
    getStepAlpha(toolProps, touchData, size),
    round(startRotation, 4),
    getStepAspectRatio(toolProps, touchData),
  ]
}

const getStepMoveLineData = (
  toolProps: StepToolParams,
  touchData: StepTouchData,
  lastStep: StepLastState
): ['move', number, number, number, number] => {
  const size = getStepSize(toolProps, touchData)
  return [
    'move',
    size,
    getStepAlpha(toolProps, touchData, size),
    getStepRotation(toolProps, touchData, lastStep),
    getStepAspectRatio(toolProps, touchData),
  ]
}

const getStepEndLineData = (
  toolProps: StepToolParams,
  touchData: StepTouchData,
  lastStep: StepLastState
): ['end', number, number, number, number] => {
  const rawSize = getStepSize(toolProps, touchData)
  const taper = getNumberInBetween(0, 1, toolProps.endTaperFactor ?? 1, 3)
  const size = taper < 1 ? Math.max(1, Math.round(rawSize * (1 - taper * 0.3))) : rawSize
  const moveAlpha = getStepAlpha(toolProps, touchData, size)
  const prevAlpha =
    typeof lastStep.alpha === 'number' && lastStep.alpha > 0 ? lastStep.alpha : moveAlpha
  const alpha =
    taper >= 1
      ? toolProps.minAlpha
      : getNumberInBetween(
          toolProps.minAlpha,
          round(prevAlpha * (1 - taper) + toolProps.minAlpha * taper, 3),
          toolProps.maxAlpha
        )
  return [
    'end',
    size,
    alpha,
    getStepRotation(toolProps, touchData, lastStep),
    getStepAspectRatio(toolProps, touchData),
  ]
}

export const getStepData = (
  toolProps: StepToolParams,
  touchData: StepTouchData,
  lastStep: StepLastState
): StrokeSample => {
  let type: 'start' | 'move' | 'end'
  let size: number
  let alpha: number
  let rotation: number
  let aspectRatio: number

  if (touchData.type === Params.eventMove || touchData.type === 'move') {
    ;[type, size, alpha, rotation, aspectRatio] = getStepMoveLineData(
      toolProps,
      touchData,
      lastStep
    )
  } else if (touchData.type === Params.eventStart || touchData.type === 'start') {
    ;[type, size, alpha, rotation, aspectRatio] = getStepStartLineData(toolProps, touchData)
  } else {
    ;[type, size, alpha, rotation, aspectRatio] = getStepEndLineData(toolProps, touchData, lastStep)
  }

  return {
    type,
    x: touchData.x,
    y: touchData.y,
    midX: touchData.midX,
    midY: touchData.midY,
    size,
    alpha,
    rotation,
    oldSize: lastStep.size as number,
    oldAlpha: lastStep.alpha as number,
    oldRotation: lastStep.rotation as number,
    oldMidX: lastStep.midX as number,
    oldMidY: lastStep.midY as number,
    oldX: lastStep.x as number,
    oldY: lastStep.y as number,
    stepLength: touchData.stepLength,
    aspectRatio,
    oldAspectRatio: (lastStep.aspectRatio ?? aspectRatio) as number,
  }
}
