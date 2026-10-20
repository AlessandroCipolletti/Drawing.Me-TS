import Params from 'main/Params'
import { round, getNumberInBetween } from 'utils/mathUtils'
import { StrokeSample } from 'utils/canvasUtils'
import { TOUCH_TYPE_STYLUS } from 'main/constants'

export interface StepToolParams {
  size: number
  sizeForceFactor?: number
  sizeSpeedFactor?: number
  sizeAltitudeFactor?: number
  alpha: number
  minAlpha: number
  maxAlpha: number
  alphaForceFactor?: number
  alphaSpeedFactor?: number
  alphaAltitudeFactor?: number
  degradeAlphaBySize?: boolean
  handleStylusRotation?: boolean
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
  speedFactor?: number
  altitudeFactor?: number
  azimuthAngle?: number
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
  speedFactor?: number
}

export function getAltitudeFactorFromAngle(angle: number, maxFactor: number): number {
  return getNumberInBetween(0, 1, (1 - angle / (Math.PI / 2)) / maxFactor)
}

export const getStepSize = (toolProps: StepToolParams, touchData: StepTouchData): number => {
  return Math.round(
    toolProps.size +
      toolProps.size * (toolProps.sizeForceFactor || 0) * (touchData.force || 0) +
      toolProps.size * (toolProps.sizeSpeedFactor || 0) * (touchData.speedFactor || 0) +
      toolProps.size * (toolProps.sizeAltitudeFactor || 0) * (touchData.altitudeFactor || 0)
  )
}

export const getStepAlpha = (
  toolsProps: StepToolParams,
  touchData: StepTouchData,
  currentSize: number
): number => {
  let alpha =
    round(
      toolsProps.alpha +
        (touchData.force || 0) * (toolsProps.alphaForceFactor || 0) +
        (touchData.speedFactor || 0) * (toolsProps.alphaSpeedFactor || 0) +
        (touchData.altitudeFactor || 0) * (toolsProps.alphaAltitudeFactor || 0),
      3
    ) / (toolsProps.degradeAlphaBySize ? currentSize / toolsProps.size : 1)
  alpha = getNumberInBetween(toolsProps.minAlpha, alpha, toolsProps.maxAlpha)
  return alpha
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
      if (toolsProps.handleStylusRotation) {
        if (touchData.canHandleStylusRotation) {
          rotation = touchData.azimuthAngle || 0
        } else {
          rotation = lastStep.rotation || 0
        }
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
): ['start', number, number, number] => {
  const size = getStepSize(toolProps, touchData)
  return [
    'start',
    size,
    getStepAlpha(toolProps, touchData, size),
    toolProps.handleStylusRotation ? round(touchData.azimuthAngle || 0, 4) : 0,
  ]
}

const getStepMoveLineData = (
  toolProps: StepToolParams,
  touchData: StepTouchData,
  lastStep: StepLastState
): ['move', number, number, number] => {
  const size = getStepSize(toolProps, touchData)
  return [
    'move',
    size,
    getStepAlpha(toolProps, touchData, size),
    getStepRotation(toolProps, touchData, lastStep),
  ]
}

const getStepEndLineData = (
  toolProps: StepToolParams,
  touchData: StepTouchData,
  lastStep: StepLastState
): ['end', number, number, number] => {
  return [
    'end',
    getStepSize(toolProps, touchData),
    toolProps.minAlpha,
    getStepRotation(toolProps, touchData, lastStep),
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

  if (touchData.type === Params.eventMove || touchData.type === 'move') {
    ;[type, size, alpha, rotation] = getStepMoveLineData(toolProps, touchData, lastStep)
  } else if (touchData.type === Params.eventStart || touchData.type === 'start') {
    ;[type, size, alpha, rotation] = getStepStartLineData(toolProps, touchData)
  } else {
    ;[type, size, alpha, rotation] = getStepEndLineData(toolProps, touchData, lastStep)
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
  }
}
