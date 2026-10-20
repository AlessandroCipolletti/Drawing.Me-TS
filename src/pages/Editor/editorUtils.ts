import Params from 'main/Params'
import { config, currentCanvasHasZoom } from 'pages/Editor'
import {
  round,
  getNumberInBetween,
  getOriginalCoordsFromScaleRotation,
  getDistanceBetweenThreePoints,
  getAngleRadBetweenTwoPoints,
  rotateCoords,
  convertAngleDegToRad,
} from 'utils/mathUtils'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import { getEventCoordX, getEventCoordY } from 'utils/domUtils'
import {
  setImageShapeIfNeeded,
  ExtendedCanvasContext,
  StrokeSample,
  drawStrokeSample,
} from 'utils/canvasUtils'
import * as Ruler from './components/Ruler'
import * as Layers from './components/Layers'
import { spacing } from 'main/Theme'
import { TOUCH_TYPE_STYLUS } from 'main/constants'
import { getOneToolVersionCompleteProps } from 'pages/Editor/components/Tools'

export const initEditorUtils = (_width?: number, _height?: number) => {}

export const cleanEditorUtils = () => {}

export const drawMultipleCoworkingSteps = (() => {
  let currentCoworkingToolName = ''
  let currentCoworkingToolVersion: any = -1
  let currentCoworkingToolProps: any = {}

  return async (
    layerId: string,
    steps: StrokeSample[],
    tool: any,
    fns: {
      start?: (ctx: ExtendedCanvasContext, step: StrokeSample, toolProps: any) => boolean
      move?: (ctx: ExtendedCanvasContext, step: StrokeSample, toolProps: any) => boolean
      end?: (ctx: ExtendedCanvasContext, step: StrokeSample, toolProps: any) => boolean
      bucket: (layerId: string, x: number, y: number, color: string) => Promise<void>
    }
  ) => {
    const destinationContext = Layers.getLayerContext(layerId)
    if (!destinationContext) {
      return
    }

    if (currentCoworkingToolName !== tool.name || currentCoworkingToolVersion !== tool.version) {
      currentCoworkingToolName = tool.name
      currentCoworkingToolVersion = tool.version
      currentCoworkingToolProps = getOneToolVersionCompleteProps(tool.name, tool.version, {
        color: tool.color,
        globalCompositeOperation: tool.globalCompositeOperation,
        frameImageName: tool.frameImageName,
        ...tool.customProps,
      })
    } else {
      currentCoworkingToolProps = {
        ...currentCoworkingToolProps,
        color: tool.color,
        globalCompositeOperation: tool.globalCompositeOperation,
        frameImageName: tool.frameImageName,
        ...tool.customProps,
      }
    }

    if (currentCoworkingToolProps.frameImageName) {
      setImageShapeIfNeeded(
        destinationContext,
        currentCoworkingToolProps.frameImageFile,
        currentCoworkingToolProps.frameImageName,
        currentCoworkingToolProps.color
      )
    }

    if (currentCoworkingToolProps.name === 'bucket') {
      await fns.bucket(layerId, steps[0].x, steps[0].y, currentCoworkingToolProps.color)
    } else {
      for (const step of steps) {
        drawStrokeSample(destinationContext, step, currentCoworkingToolProps, true)
      }
      destinationContext.globalAlpha = 1
      destinationContext.globalCompositeOperation = 'source-over'
    }
  }
})()

function getAltitudeFactorFromAngle(angle: number, maxFactor: number): number {
  return getNumberInBetween(0, 1, (1 - angle / (Math.PI / 2)) / maxFactor)
}

const getTouchEventData = (touchEvent: any, lastStep: any, offsetX = 0, offsetY = 0) => {
  const data: Record<string, any> = {}

  data.type = touchEvent.type
  data.x = getEventCoordX(touchEvent, offsetX)
  data.y = getEventCoordY(touchEvent, offsetY)
  if (touchEvent.type === Params.eventStart || touchEvent.type === 'start') {
    data.midX = data.x
    data.midY = data.y
    data.stepLength = 0
    data.speedFactor = 0
  } else {
    data.midX = round((lastStep.x + data.x) / 2, 1)
    data.midY = round((lastStep.y + data.y) / 2, 1)
    data.stepLength = getDistanceBetweenThreePoints(
      lastStep.midX,
      lastStep.midY,
      lastStep.x,
      lastStep.y,
      data.midX,
      data.midY,
      1
    )
    if (touchEvent.type === Params.eventEnd || touchEvent.type === 'end') {
      data.speedFactor = lastStep.speedFactor / 2
    } else {
      data.speedFactor =
        Math.min(config.maxSpeedFactorLength, data.stepLength) / config.maxSpeedFactorLength
    }
  }

  if (touchEvent.touchType === TOUCH_TYPE_STYLUS) {
    if (touchEvent.force === config.initialForceTouchBugValue) {
      data.force = touchEvent.force / 4
    } else {
      data.force = Math.max(round((touchEvent.force - 0.1) * 1.11, 3), 0.001)
    }
  } else if (touchEvent.type === Params.eventStart || touchEvent.type === 'start') {
    data.force = config.defaultForceTouch
  } else if (touchEvent.type === Params.eventEnd || touchEvent.type === 'end') {
    data.force = config.initialForceTouchBugValue / 4
  } else {
    data.force = config.defaultForceTouch
  }

  data.azimuthAngle = touchEvent.azimuthAngle || 0
  if (touchEvent.type === Params.eventStart || touchEvent.type === 'start') {
    data.pathRotation = 0
  } else {
    data.pathRotation = getAngleRadBetweenTwoPoints(lastStep.x, lastStep.y, data.x, data.y)
  }

  data.altitudeAngle = touchEvent.altitudeAngle || config.defaultAltitudeAngle
  data.altitudeFactor = getAltitudeFactorFromAngle(
    data.altitudeAngle,
    config.maxSupportedStylusAltitudeFactor
  )
  data.canHandleStylusRotation =
    Boolean(data.canHandleStylusRotation) &&
    data.altitudeFactor > config.minAltitudeFactorToHandleRotation

  return data
}

export const getStepsDataFromTouchEvents = (
  touchEvents: any[],
  tool: any,
  offsetX = 0,
  offsetY = 0
): StrokeSample[] => {
  const lastStep: Record<string, any> = {}
  const stepsData: StrokeSample[] = []

  for (const touchEvent of touchEvents) {
    const touchData = getTouchEventData(touchEvent, lastStep, offsetX, offsetY)
    const stepData = getStepData(tool, touchData, lastStep)
    stepsData.push(stepData)

    lastStep.x = stepData.x
    lastStep.y = stepData.y
    lastStep.midX = stepData.midX
    lastStep.midY = stepData.midY
    lastStep.size = stepData.size
    lastStep.alpha = stepData.alpha
    lastStep.rotation = stepData.rotation
    lastStep.speedFactor = touchData.speedFactor
  }

  return stepsData
}

export const updateLastStepData = (state: any, stepData: StrokeSample) => {
  state.lastStep.x = stepData.x
  state.lastStep.y = stepData.y
  state.lastStep.midX = stepData.midX
  state.lastStep.midY = stepData.midY
  state.lastStep.size = stepData.size
  state.lastStep.alpha = stepData.alpha
  state.lastStep.rotation = stepData.rotation
}

export const updateCurrentTouchData = (
  state: any,
  touchEvent: any,
  eventType: string,
  x: number | false = false,
  y: number | false = false
) => {
  const currentTouch = state.currentTouch
  currentTouch.type = eventType
  if (touchEvent?.touchType) {
    currentTouch.touchType = touchEvent.touchType
  }

  if (x === false || y === false) {
    currentTouch.x = getEventCoordX(touchEvent, state.canvas.offset.left)
    currentTouch.y = getEventCoordY(touchEvent, state.canvas.offset.top)
    currentTouch.eventX = currentTouch.x + state.canvas.offset.left
    currentTouch.eventY = currentTouch.y + state.canvas.offset.top
    if (eventType === Params.eventStart) {
      currentTouch.isNearRuler = Ruler.checkCoordNearRuler(
        currentTouch.x + state.canvas.offset.left,
        currentTouch.y + state.canvas.offset.top
      )
    }
    if (currentTouch.isNearRuler) {
      ;[currentTouch.x, currentTouch.y] = Ruler.getCoordsNearRuler(
        currentTouch.x,
        currentTouch.y,
        state.canvas.offset.left,
        state.canvas.offset.top
      )
    }
    if (currentCanvasHasZoom()) {
      ;[currentTouch.x, currentTouch.y] = getOriginalCoordsFromScaleRotation(
        currentTouch.x,
        currentTouch.y,
        state.canvas.originCoordX,
        state.canvas.originCoordY,
        state.canvas.scale,
        state.canvas.rotation
      )
    }
  } else {
    currentTouch.x = x - state.canvas.offset.left
    currentTouch.y = y - state.canvas.offset.top
    currentTouch.eventX = currentTouch.x + state.canvas.offset.left
    currentTouch.eventY = currentTouch.y + state.canvas.offset.top
    if (currentCanvasHasZoom()) {
      ;[currentTouch.x, currentTouch.y] = getOriginalCoordsFromScaleRotation(
        currentTouch.x,
        currentTouch.y,
        state.canvas.originCoordX,
        state.canvas.originCoordY,
        state.canvas.scale,
        state.canvas.rotation
      )
    }
  }
  currentTouch.x = round(currentTouch.x * Params.pxScale, 1)
  currentTouch.y = round(currentTouch.y * Params.pxScale, 1)

  if (eventType === Params.eventStart) {
    currentTouch.startDragX = currentTouch.eventX
    currentTouch.startDragY = currentTouch.eventY
    currentTouch.dragX = 0
    currentTouch.dragY = 0
    currentTouch.midX = currentTouch.x
    currentTouch.midY = currentTouch.y
    currentTouch.stepLength = 0
    currentTouch.speedFactor = 0
  } else {
    currentTouch.dragX = round(
      ((currentTouch.eventX - currentTouch.startDragX) * Params.pxScale) / state.canvas.scale,
      1
    )
    currentTouch.dragY = round(
      ((currentTouch.eventY - currentTouch.startDragY) * Params.pxScale) / state.canvas.scale,
      1
    )
    if (currentCanvasHasZoom()) {
      ;[currentTouch.dragX, currentTouch.dragY] = rotateCoords(
        currentTouch.dragX,
        currentTouch.dragY,
        convertAngleDegToRad(state.canvas.rotation)
      )
    }
    currentTouch.midX = round((state.lastStep.x + currentTouch.x) / 2, 1)
    currentTouch.midY = round((state.lastStep.y + currentTouch.y) / 2, 1)
    currentTouch.stepLength = getDistanceBetweenThreePoints(
      state.lastStep.midX,
      state.lastStep.midY,
      state.lastStep.x,
      state.lastStep.y,
      currentTouch.midX,
      currentTouch.midY,
      1
    )
    if (eventType === Params.eventEnd) {
      currentTouch.speedFactor = currentTouch.speedFactor / 2
    } else {
      currentTouch.speedFactor =
        Math.min(config.maxSpeedFactorLength, currentTouch.stepLength) / config.maxSpeedFactorLength
    }
  }

  if (touchEvent?.touchType === TOUCH_TYPE_STYLUS) {
    if (touchEvent.force === config.initialForceTouchBugValue) {
      currentTouch.force = touchEvent.force / 4
    } else {
      currentTouch.force = Math.max(round((touchEvent.force - 0.1) * 1.11, 3), 0.001)
    }
  } else if (eventType === Params.eventStart) {
    currentTouch.force = config.defaultForceTouch
  } else if (eventType === Params.eventEnd) {
    currentTouch.force = config.initialForceTouchBugValue / 4
  }

  currentTouch.azimuthAngle = touchEvent?.azimuthAngle || currentTouch.azimuthAngle
  if (eventType === Params.eventStart) {
    currentTouch.pathRotation = 0
  } else {
    currentTouch.pathRotation = getAngleRadBetweenTwoPoints(
      state.lastStep.x,
      state.lastStep.y,
      currentTouch.x,
      currentTouch.y
    )
  }

  if (touchEvent?.touchType === TOUCH_TYPE_STYLUS) {
    currentTouch.altitudeAngle = touchEvent.altitudeAngle ?? config.defaultAltitudeAngle
    currentTouch.altitudeFactor = getAltitudeFactorFromAngle(
      currentTouch.altitudeAngle,
      config.maxSupportedStylusAltitudeFactor
    )
    currentTouch.canHandleStylusRotation =
      currentTouch.canHandleStylusRotation &&
      currentTouch.altitudeFactor > config.minAltitudeFactorToHandleRotation
  }
}

export const getStepData = (toolProps: any, touchData: any, lastStep: any): StrokeSample => {
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
    oldSize: lastStep.size,
    oldAlpha: lastStep.alpha,
    oldRotation: lastStep.rotation,
    oldMidX: lastStep.midX,
    oldMidY: lastStep.midY,
    oldX: lastStep.x,
    oldY: lastStep.y,
    stepLength: touchData.stepLength,
  }
}

const getStepStartLineData = (
  toolProps: any,
  touchData: any
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
  toolProps: any,
  touchData: any,
  lastStep: any
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
  toolProps: any,
  touchData: any,
  lastStep: any
): ['end', number, number, number] => {
  return [
    'end',
    getStepSize(toolProps, touchData),
    toolProps.minAlpha,
    getStepRotation(toolProps, touchData, lastStep),
  ]
}

const getStepSize = (toolProps: any, touchData: any): number => {
  return Math.round(
    toolProps.size +
      toolProps.size * (toolProps.sizeForceFactor || 0) * (touchData.force || 0) +
      toolProps.size * (toolProps.sizeSpeedFactor || 0) * (touchData.speedFactor || 0) +
      toolProps.size * (toolProps.sizeAltitudeFactor || 0) * (touchData.altitudeFactor || 0)
  )
}

const getStepAlpha = (toolsProps: any, touchData: any, currentSize: number): number => {
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

const getStepRotation = (toolsProps: any, touchData: any, lastStep: any): number => {
  let rotation = lastStep.rotation || 0

  if (!touchData.isNearRuler) {
    if (touchData.type === TOUCH_TYPE_STYLUS || touchData.touchType === TOUCH_TYPE_STYLUS) {
      rotation = 0
      if (toolsProps.handleStylusRotation) {
        if (touchData.canHandleStylusRotation) {
          rotation = touchData.azimuthAngle
        } else {
          rotation = lastStep.rotation || 0
        }
      }
      if (toolsProps.handlePathRotation) {
        rotation += touchData.pathRotation
      }
    } else if (toolsProps.handlePathRotation) {
      rotation = -touchData.pathRotation
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

export const shouldThisStepMoveAdaptLine = (state: any): boolean => {
  let result = false
  const now = Date.now()
  state.pxDistanceSinceLastLineAdaptation += state.currentTouch.stepLength
  state.stepsSinceLastLineAdaptation++

  if (
    state.pxDistanceSinceLastLineAdaptation >=
      round(state.currentToolProps.pxToAdaptLine / state.canvas.scale, 1) &&
    (state.stepsSinceLastLineAdaptation >= state.currentToolProps.stepsToAdaptLine ||
      now - state.lastLineAdaptationTimestamp >= state.currentToolProps.msToAdaptLine)
  ) {
    result = true
    state.pxDistanceSinceLastLineAdaptation = 0
    state.stepsSinceLastLineAdaptation = 0
    state.lastLineAdaptationTimestamp = now
  }

  return result
}

export const updateEditorZoomGlobalState = (currentScale: number) => {
  document.documentElement.style.setProperty(
    '--one-cm-size-by-scale',
    `${parseFloat(spacing.ONE_CM_SIZE) * currentScale}cm`
  )
  removeGlobalStatus('drawith__EDITOR-NO-ZOOM')
  removeGlobalStatus('drawith__EDITOR-ZOOM-IN')
  removeGlobalStatus('drawith__EDITOR-ZOOM-OUT')
  if (currentScale === 1) {
    addGlobalStatus('drawith__EDITOR-NO-ZOOM')
  } else if (currentScale > 1) {
    addGlobalStatus('drawith__EDITOR-ZOOM-IN')
  } else {
    addGlobalStatus('drawith__EDITOR-ZOOM-OUT')
  }
}

export const initCanvasOffset = (state: any) => {
  state.canvas = state.canvas || {}
  const safeRight =
    parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--safe-area-right'),
      10
    ) || 0
  if (Params.isPhone) {
    const landscapePadding = Params.width > Params.height ? spacing.PHONE_LANDSCAPE_PADDING : 0
    state.canvas.offset = {
      left: spacing.EDITOR_PAGE_MARGIN + landscapePadding,
      top: spacing.EDITOR_PAGE_MARGIN + spacing.HEADER_HEIGHT,
      right: spacing.EDITOR_PAGE_MARGIN + landscapePadding + safeRight,
      bottom: spacing.APP_MARGIN_BOTTOM,
    }
  } else {
    state.canvas.offset = {
      left: spacing.EDITOR_PAGE_MARGIN + spacing.EDITOR_TOOLS_WIDTH,
      top: spacing.EDITOR_PAGE_MARGIN + spacing.HEADER_HEIGHT,
      right: spacing.EDITOR_PAGE_MARGIN + spacing.EDITOR_TOOLS_WIDTH + safeRight,
      bottom: spacing.EDITOR_PAGE_MARGIN + spacing.COLORPICKER_HEIGHT + spacing.APP_MARGIN_BOTTOM,
    }
  }
}

export const initState = (initialState: any) => {
  const state = JSON.parse(JSON.stringify(initialState))
  initCanvasOffset(state)
  return state
}

export const findValueWithMagnetism = (
  value: number,
  magnetimsValues: Array<[number, number | false]> = [],
  tollerance = Params.isTablet ? 15 : 10
): [number, number | false, boolean] => {
  for (let i = 0; i < magnetimsValues.length; i++) {
    if (Math.abs(value - magnetimsValues[i][0]) <= tollerance) {
      return [magnetimsValues[i][0], magnetimsValues[i][1], true]
    }
  }

  return [value, false, false]
}

export const applyRationResizeMagnetism = (
  resizeState: any,
  magnetismCoords: any,
  left: boolean,
  top: boolean,
  right: boolean,
  bottom: boolean
): [any, number, number] => {
  const ratio = resizeState.w / resizeState.h
  const draggedSides: Record<string, any> = {}
  let lineXCoord = 0
  let lineYCoord = 0

  if (left) {
    const dragValue = resizeState.x - resizeState.w / 2
    const [newValue, magnetismLineCoord, magnetised] = findValueWithMagnetism(
      dragValue,
      magnetismCoords.l
    )
    if (magnetised) {
      draggedSides.left = {
        dragValue,
        newValue,
        magnetismLineCoord,
        diff: newValue - dragValue,
      }
    }
  } else if (right) {
    const dragValue = resizeState.x + resizeState.w / 2
    const [newValue, magnetismLineCoord, magnetised] = findValueWithMagnetism(
      dragValue,
      magnetismCoords.r
    )
    if (magnetised) {
      draggedSides.right = {
        dragValue,
        newValue,
        magnetismLineCoord,
        diff: newValue - dragValue,
      }
    }
  }
  if (top) {
    const dragValue = resizeState.y - resizeState.h / 2
    const [newValue, magnetismLineCoord, magnetised] = findValueWithMagnetism(
      dragValue,
      magnetismCoords.t
    )
    if (magnetised) {
      draggedSides.top = {
        dragValue,
        newValue,
        magnetismLineCoord,
        diff: newValue - dragValue,
      }
    }
  } else if (bottom) {
    const dragValue = resizeState.y + resizeState.h / 2
    const [newValue, magnetismLineCoord, magnetised] = findValueWithMagnetism(
      dragValue,
      magnetismCoords.b
    )
    if (magnetised) {
      draggedSides.bottom = {
        dragValue,
        newValue,
        magnetismLineCoord,
        diff: newValue - dragValue,
      }
    }
  }

  if (Object.keys(draggedSides).length) {
    const maxDiff = Math.max(...Object.values(draggedSides).map((side) => side.diff))
    const maxMagnetisedSide = Object.keys(draggedSides).find(
      (key) => draggedSides[key].diff === maxDiff
    )
    if (maxMagnetisedSide === 'left') {
      resizeState.x = round(resizeState.x + draggedSides.left.diff / 2, 1)
      resizeState.w = round((resizeState.x - draggedSides.left.newValue) * 2, 1)
      lineXCoord = round(draggedSides.left.magnetismLineCoord || 0, 0)
      if (top || bottom) {
        const newHeight = round(resizeState.w / ratio, 1)
        const heightDiff = newHeight - resizeState.h
        resizeState.h = newHeight
        if (top) {
          resizeState.y = round(resizeState.y - heightDiff / 2, 1)
        } else {
          resizeState.y = round(resizeState.y + heightDiff / 2, 1)
        }
      }
    } else if (maxMagnetisedSide === 'right') {
      resizeState.x = round(resizeState.x + draggedSides.right.diff / 2, 1)
      resizeState.w = round((draggedSides.right.newValue - resizeState.x) * 2, 1)
      lineXCoord = round(draggedSides.right.magnetismLineCoord || 0, 0)
      if (top || bottom) {
        const newHeight = round(resizeState.w / ratio, 1)
        const heightDiff = newHeight - resizeState.h
        resizeState.h = newHeight
        if (top) {
          resizeState.y = round(resizeState.y - heightDiff / 2, 1)
        } else {
          resizeState.y = round(resizeState.y + heightDiff / 2, 1)
        }
      }
    } else if (maxMagnetisedSide === 'top') {
      resizeState.y = round(resizeState.y + draggedSides.top.diff / 2, 1)
      resizeState.h = round((resizeState.y - draggedSides.top.newValue) * 2, 1)
      lineYCoord = round(draggedSides.top.magnetismLineCoord || 0, 0)
      if (left || right) {
        const newWidth = round(resizeState.h * ratio, 1)
        const widthDiff = newWidth - resizeState.w
        resizeState.w = newWidth
        if (left) {
          resizeState.x = round(resizeState.x - widthDiff / 2, 1)
        } else {
          resizeState.x = round(resizeState.x + widthDiff / 2, 1)
        }
      }
    } else if (maxMagnetisedSide === 'bottom') {
      resizeState.y = round(resizeState.y + draggedSides.bottom.diff / 2, 1)
      resizeState.h = round((draggedSides.bottom.newValue - resizeState.y) * 2, 1)
      lineYCoord = round(draggedSides.bottom.magnetismLineCoord || 0, 0)
      if (left || right) {
        const newWidth = round(resizeState.h * ratio, 1)
        const widthDiff = newWidth - resizeState.w
        resizeState.w = newWidth
        if (left) {
          resizeState.x = round(resizeState.x - widthDiff / 2, 1)
        } else {
          resizeState.x = round(resizeState.x + widthDiff / 2, 1)
        }
      }
    }
  }

  return [resizeState, lineXCoord, lineYCoord]
}
