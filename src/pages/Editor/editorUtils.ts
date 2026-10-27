import Params from 'main/Params'
import { editorDefaultConfig as config } from './config'
import { currentCanvasHasZoom } from './editorCanvasZoom'
import { computeCanvasOffset } from './editorCanvasMetrics'
import {
  round,
  getOriginalCoordsFromScaleRotation,
  getDistanceBetweenThreePoints,
  getAngleRadBetweenTwoPoints,
  rotateCoords,
  convertAngleDegToRad,
  getNumberInBetween,
} from 'utils/mathUtils'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import { getEventCoordX, getEventCoordY } from 'utils/domUtils'
import {
  setImageShapeIfNeeded,
  ExtendedCanvasContext,
  StrokeSample,
  drawStrokeSample,
} from 'utils/canvasUtils'
import { checkCoordNearRuler, getCoordsNearRuler } from './components/Ruler/rulerRender'
import { getLayerContext, LayersMagnetismCoords } from './components/Layers/layersState'
import { spacing } from 'main/Theme'
import { TOUCH_TYPE_STYLUS } from 'main/constants'
import { getOneToolVersionCompleteProps } from './components/Tools/toolsPersistence'
import { ToolCustomPropsMap, toolDefaultProps } from './config'
import { CurrentToolProps, EditorState, PointerTouchEvent, ResizeModeState } from './editorTypes'
import {
  applyOneEuroFilter,
  getAltitudeFactorFromAngle,
  getStepData,
  StepLastState,
  StepToolParams,
  StepTouchData,
} from './editorStepMath'
import {
  createSmudgeStrokeSession,
  resetSmudgeStrokeSession,
  smudgeStrokeStep,
  SMUDGE_INPUT_PEN,
  SmudgeInputKind,
} from './smudgeKernel'

export { getStepData }

let currentCoworkingToolProps: CurrentToolProps = {
  ...toolDefaultProps,
  color: '',
  randomColor: false,
}

export const initEditorUtils = (_width?: number, _height?: number) => {}

export const cleanEditorUtils = () => {
  currentCoworkingToolProps = {
    ...toolDefaultProps,
    color: '',
    randomColor: false,
  }
}

export interface CoworkingToolDescriptor {
  name: string
  version?: number | string | false
  color: string | false
  globalCompositeOperation?: GlobalCompositeOperation
  frameImageName?: string | false
  customProps?: ToolCustomPropsMap
}

export const drawMultipleCoworkingSteps = async (
  layerId: string,
  steps: StrokeSample[],
  tool: CoworkingToolDescriptor,
  fns: {
    start?: (ctx: ExtendedCanvasContext, step: StrokeSample, toolProps: CurrentToolProps) => boolean
    move?: (ctx: ExtendedCanvasContext, step: StrokeSample, toolProps: CurrentToolProps) => boolean
    end?: (ctx: ExtendedCanvasContext, step: StrokeSample, toolProps: CurrentToolProps) => boolean
    bucket: (
      layerId: string,
      x: number,
      y: number,
      color: string,
      step?: StrokeSample
    ) => Promise<void>
  }
) => {
  const destinationContext = getLayerContext(layerId)
  if (!destinationContext) {
    return
  }

  const resolvedVersion =
    typeof tool.version === 'number' || typeof tool.version === 'string'
      ? Number(tool.version)
      : false
  currentCoworkingToolProps = {
    ...getOneToolVersionCompleteProps(tool.name, resolvedVersion, {
      color: tool.color || '',
      globalCompositeOperation: tool.globalCompositeOperation,
      frameImageName: tool.frameImageName,
      ...tool.customProps,
    }),
    color: tool.color || '',
    randomColor: false,
  }

  if (currentCoworkingToolProps.frameImageName && currentCoworkingToolProps.frameImageFile) {
    setImageShapeIfNeeded(
      destinationContext,
      currentCoworkingToolProps.frameImageFile as HTMLImageElement,
      currentCoworkingToolProps.frameImageName,
      currentCoworkingToolProps.color
    )
  }

  if (currentCoworkingToolProps.name === 'bucket') {
    await fns.bucket(layerId, steps[0].x, steps[0].y, currentCoworkingToolProps.color, steps[0])
  } else if (currentCoworkingToolProps.name === 'smudge') {
    const session = createSmudgeStrokeSession()
    for (const step of steps) {
      const phase = step.type
      if (phase !== 'start' && phase !== 'move' && phase !== 'end') continue
      smudgeStrokeStep(
        destinationContext,
        session,
        step,
        phase,
        typeof step.inputKind === 'number' ? (step.inputKind as SmudgeInputKind) : SMUDGE_INPUT_PEN
      )
    }
    resetSmudgeStrokeSession(session)
    destinationContext.globalAlpha = 1
    destinationContext.globalCompositeOperation = 'source-over'
  } else {
    for (const step of steps) {
      drawStrokeSample(destinationContext, step, currentCoworkingToolProps, true)
    }
    destinationContext.globalAlpha = 1
    destinationContext.globalCompositeOperation = 'source-over'
  }
}

const getTouchEventData = (
  touchEvent: PointerTouchEvent,
  lastStep: StepLastState,
  offsetX = 0,
  offsetY = 0,
  tool?: StepToolParams
): StepTouchData => {
  const x = getEventCoordX(touchEvent, offsetX)
  const y = getEventCoordY(touchEvent, offsetY)
  let midX: number
  let midY: number
  let stepLength: number
  let speedFactor: number

  if (touchEvent.type === Params.eventStart || touchEvent.type === 'start') {
    midX = x
    midY = y
    stepLength = 0
    speedFactor = 0
  } else {
    const prevX = lastStep.x ?? x
    const prevY = lastStep.y ?? y
    const prevMidX = lastStep.midX ?? x
    const prevMidY = lastStep.midY ?? y
    midX = round((prevX + x) / 2, 1)
    midY = round((prevY + y) / 2, 1)
    stepLength = getDistanceBetweenThreePoints(prevMidX, prevMidY, prevX, prevY, midX, midY, 1)
    if (touchEvent.type === Params.eventEnd || touchEvent.type === 'end') {
      speedFactor = (lastStep.speedFactor || 0) / 2
    } else {
      const distSpeed =
        Math.min(config.maxSpeedFactorLength, stepLength) / config.maxSpeedFactorLength
      const eventTimeStamp = touchEvent.timeStamp || 0
      const prevTimeStamp = lastStep.timeStamp || 0
      const dtMs =
        eventTimeStamp > 0 && prevTimeStamp > 0 && eventTimeStamp > prevTimeStamp
          ? eventTimeStamp - prevTimeStamp
          : 0
      let rawSpeed = distSpeed
      const toolAny = tool as {
        useTimeBasedSpeed?: boolean
        maxVelocityPxPerMs?: number
        speedSmoothing?: number
      }
      if (toolAny?.useTimeBasedSpeed && dtMs > 0) {
        const maxVel = Math.max(0.1, (toolAny.maxVelocityPxPerMs || 2.5) * Params.pxScale)
        rawSpeed = getNumberInBetween(0, 1, stepLength / dtMs / maxVel, 4)
      }
      const smoothing = getNumberInBetween(0, 0.95, toolAny?.speedSmoothing || 0, 2)
      if (smoothing > 0) {
        const prevSpeed = lastStep.speedFactor ?? 0
        speedFactor = round(prevSpeed * smoothing + rawSpeed * (1 - smoothing), 4)
      } else {
        speedFactor = rawSpeed
      }
    }
  }

  let force: number
  if (touchEvent.touchType === TOUCH_TYPE_STYLUS) {
    const rawForce = touchEvent.force || 0
    if (rawForce === config.initialForceTouchBugValue) {
      force = rawForce / 4
    } else {
      force = Math.max(round((rawForce - 0.1) * 1.11, 3), 0.001)
    }
  } else if (touchEvent.type === Params.eventStart || touchEvent.type === 'start') {
    force = config.defaultForceTouch
  } else if (touchEvent.type === Params.eventEnd || touchEvent.type === 'end') {
    force = config.initialForceTouchBugValue / 4
  } else {
    force = config.defaultForceTouch
  }

  const azimuthAngle = touchEvent.azimuthAngle || 0
  const twist = touchEvent.twist || 0
  const hasTwist = Boolean(touchEvent.hasTwist || twist !== 0)
  const tangentialPressure = touchEvent.tangentialPressure || 0
  const pathRotation =
    touchEvent.type === Params.eventStart || touchEvent.type === 'start'
      ? 0
      : getAngleRadBetweenTwoPoints(lastStep.x ?? x, lastStep.y ?? y, x, y)

  const altitudeAngle = touchEvent.altitudeAngle || config.defaultAltitudeAngle
  const altitudeFactor = getAltitudeFactorFromAngle(
    altitudeAngle,
    config.maxSupportedStylusAltitudeFactor
  )
  const minAltForRot =
    typeof tool?.minAltitudeFactorToHandleRotation === 'number' &&
    !Number.isNaN(tool.minAltitudeFactorToHandleRotation)
      ? tool.minAltitudeFactorToHandleRotation
      : config.minAltitudeFactorToHandleRotation
  const canHandleStylusRotation = altitudeFactor > minAltForRot

  return {
    type: touchEvent.type,
    touchType: touchEvent.touchType,
    x,
    y,
    midX,
    midY,
    stepLength,
    speedFactor,
    force,
    tangentialPressure,
    azimuthAngle,
    twist,
    hasTwist,
    pathRotation,
    altitudeFactor,
    canHandleStylusRotation,
  }
}

const commitTouchEventStep = (
  touchEvent: PointerTouchEvent,
  lastStep: StepLastState,
  tool: StepToolParams,
  offsetX = 0,
  offsetY = 0
): StrokeSample => {
  const touchData = getTouchEventData(touchEvent, lastStep, offsetX, offsetY, tool)
  const stepData = getStepData(tool, touchData, lastStep)

  lastStep.x = stepData.x
  lastStep.y = stepData.y
  lastStep.midX = stepData.midX
  lastStep.midY = stepData.midY
  lastStep.size = stepData.size
  lastStep.alpha = stepData.alpha
  lastStep.rotation = stepData.rotation
  lastStep.aspectRatio = stepData.aspectRatio
  lastStep.strokeDistance = stepData.strokeDistance
  lastStep.strokeRotationOffset = stepData.strokeRotationOffset
  lastStep.speedFactor = touchData.speedFactor
  if (touchEvent.timeStamp) {
    lastStep.timeStamp = touchEvent.timeStamp
  }

  return stepData
}

export const getStepsDataFromTouchEvents = (
  touchEvents: PointerTouchEvent[],
  tool: StepToolParams,
  offsetX = 0,
  offsetY = 0
): StrokeSample[] => {
  const lastStep: StepLastState = {}
  const stepsData: StrokeSample[] = []

  for (const touchEvent of touchEvents) {
    stepsData.push(commitTouchEventStep(touchEvent, lastStep, tool, offsetX, offsetY))
  }

  return stepsData
}

export const updateLastStepData = (state: EditorState, stepData: StrokeSample) => {
  state.lastStep.x = stepData.x
  state.lastStep.y = stepData.y
  state.lastStep.midX = stepData.midX
  state.lastStep.midY = stepData.midY
  state.lastStep.size = stepData.size
  state.lastStep.alpha = stepData.alpha
  state.lastStep.rotation = stepData.rotation
  state.lastStep.aspectRatio = stepData.aspectRatio ?? 1
  state.lastStep.strokeDistance = stepData.strokeDistance
  state.lastStep.strokeRotationOffset = stepData.strokeRotationOffset
  if (state.currentTouch) {
    state.lastStep.speedFactor = state.currentTouch.speedFactor
    state.lastStep.timeStamp = state.currentTouch.timeStamp
  }
}

export const updateCurrentTouchData = (
  state: EditorState,
  touchEvent: PointerTouchEvent | undefined,
  eventType: string,
  x: number | false = false,
  y: number | false = false,
  skipStabilization = false
) => {
  const currentTouch = state.currentTouch
  currentTouch.type = eventType
  if (touchEvent?.touchType) {
    currentTouch.touchType = touchEvent.touchType
  }

  const prevStabilizedX = currentTouch.x
  const prevStabilizedY = currentTouch.y

  if (x === false || y === false) {
    currentTouch.x = getEventCoordX(touchEvent, state.canvas.offset.left)
    currentTouch.y = getEventCoordY(touchEvent, state.canvas.offset.top)
    currentTouch.eventX = currentTouch.x + state.canvas.offset.left
    currentTouch.eventY = currentTouch.y + state.canvas.offset.top
    if (eventType === Params.eventStart) {
      currentTouch.isNearRuler = checkCoordNearRuler(
        currentTouch.x + state.canvas.offset.left,
        currentTouch.y + state.canvas.offset.top
      )
    }
    if (currentTouch.isNearRuler) {
      ;[currentTouch.x, currentTouch.y] = getCoordsNearRuler(
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
  currentTouch.rawX = currentTouch.x
  currentTouch.rawY = currentTouch.y

  const eventTimeStamp = touchEvent?.timeStamp || 0
  const prevTimeStamp = state.lastStep.timeStamp || currentTouch.timeStamp || 0
  const dtMs =
    eventTimeStamp > 0 && prevTimeStamp > 0 && eventTimeStamp > prevTimeStamp
      ? eventTimeStamp - prevTimeStamp
      : 0
  currentTouch.timeStamp = eventTimeStamp

  const stabilization = state.currentToolProps?.stabilization || 0
  if (skipStabilization && stabilization > 0) {
    currentTouch.x = prevStabilizedX
    currentTouch.y = prevStabilizedY
  } else if (
    eventType === Params.eventMove &&
    !currentTouch.isNearRuler &&
    stabilization > 0 &&
    typeof state.lastStep.x === 'number' &&
    state.lastStep.x >= 0
  ) {
    const [fx, vx] = applyOneEuroFilter(
      currentTouch.x,
      state.lastStep.x,
      currentTouch.velocityX || 0,
      dtMs || 8,
      stabilization
    )
    const [fy, vy] = applyOneEuroFilter(
      currentTouch.y,
      state.lastStep.y ?? currentTouch.y,
      currentTouch.velocityY || 0,
      dtMs || 8,
      stabilization
    )
    currentTouch.x = fx
    currentTouch.y = fy
    currentTouch.velocityX = vx
    currentTouch.velocityY = vy
  } else {
    currentTouch.velocityX = 0
    currentTouch.velocityY = 0
  }

  const prevX = state.lastStep.x ?? currentTouch.x
  const prevY = state.lastStep.y ?? currentTouch.y
  const prevMidX = state.lastStep.midX ?? currentTouch.x
  const prevMidY = state.lastStep.midY ?? currentTouch.y

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
    currentTouch.midX = round((prevX + currentTouch.x) / 2, 1)
    currentTouch.midY = round((prevY + currentTouch.y) / 2, 1)
    currentTouch.stepLength = getDistanceBetweenThreePoints(
      prevMidX,
      prevMidY,
      prevX,
      prevY,
      currentTouch.midX,
      currentTouch.midY,
      1
    )
    if (eventType === Params.eventEnd) {
      currentTouch.speedFactor = currentTouch.speedFactor / 2
    } else {
      const distSpeed =
        Math.min(config.maxSpeedFactorLength, currentTouch.stepLength) / config.maxSpeedFactorLength
      let rawSpeed = distSpeed
      if (state.currentToolProps?.useTimeBasedSpeed && dtMs > 0) {
        const maxVel = Math.max(
          0.1,
          (state.currentToolProps.maxVelocityPxPerMs || 2.5) * Params.pxScale
        )
        rawSpeed = getNumberInBetween(0, 1, currentTouch.stepLength / dtMs / maxVel, 4)
      }
      const smoothing = getNumberInBetween(0, 0.95, state.currentToolProps?.speedSmoothing || 0, 2)
      if (smoothing > 0) {
        const prevSpeed = state.lastStep.speedFactor ?? currentTouch.speedFactor ?? 0
        currentTouch.speedFactor = round(prevSpeed * smoothing + rawSpeed * (1 - smoothing), 4)
      } else {
        currentTouch.speedFactor = rawSpeed
      }
    }
  }

  if (touchEvent?.touchType === TOUCH_TYPE_STYLUS) {
    const rawForce = touchEvent.force || 0
    let normalizedForce: number
    if (rawForce === config.initialForceTouchBugValue) {
      normalizedForce = rawForce / 4
    } else {
      normalizedForce = Math.max(round((rawForce - 0.1) * 1.11, 3), 0.001)
    }
    if (eventType === Params.eventMove && stabilization > 0 && currentTouch.force > 0) {
      const forceSmooth = stabilization * 0.4
      currentTouch.force = round(
        currentTouch.force * forceSmooth + normalizedForce * (1 - forceSmooth),
        3
      )
    } else {
      currentTouch.force = normalizedForce
    }
  } else if (eventType === Params.eventStart) {
    currentTouch.force = config.defaultForceTouch
  } else if (eventType === Params.eventEnd) {
    currentTouch.force = config.initialForceTouchBugValue / 4
  }

  currentTouch.tangentialPressure =
    touchEvent?.tangentialPressure ?? currentTouch.tangentialPressure ?? 0
  currentTouch.azimuthAngle = touchEvent?.azimuthAngle || currentTouch.azimuthAngle
  if (typeof touchEvent?.twist === 'number') {
    currentTouch.twist = touchEvent.twist
    currentTouch.hasTwist = Boolean(touchEvent.hasTwist || touchEvent.twist !== 0)
  }

  if (eventType === Params.eventStart) {
    currentTouch.pathRotation = 0
  } else {
    currentTouch.pathRotation = getAngleRadBetweenTwoPoints(
      prevX,
      prevY,
      currentTouch.x,
      currentTouch.y
    )
  }

  if (touchEvent?.touchType === TOUCH_TYPE_STYLUS) {
    currentTouch.altitudeAngle = touchEvent.altitudeAngle ?? config.defaultAltitudeAngle
    const rawAltitudeFactor = getAltitudeFactorFromAngle(
      currentTouch.altitudeAngle,
      config.maxSupportedStylusAltitudeFactor
    )
    if (eventType === Params.eventMove && stabilization > 0) {
      const altSmooth = stabilization * 0.4
      currentTouch.altitudeFactor = round(
        currentTouch.altitudeFactor * altSmooth + rawAltitudeFactor * (1 - altSmooth),
        4
      )
    } else {
      currentTouch.altitudeFactor = rawAltitudeFactor
    }
    const minAltForRot =
      typeof state.currentToolProps?.minAltitudeFactorToHandleRotation === 'number' &&
      !Number.isNaN(state.currentToolProps.minAltitudeFactorToHandleRotation)
        ? state.currentToolProps.minAltitudeFactorToHandleRotation
        : config.minAltitudeFactorToHandleRotation
    currentTouch.canHandleStylusRotation = currentTouch.altitudeFactor > minAltForRot
  }
}

export const shouldAdaptStrokeLine = (tool: {
  size: number
  maxSizeThatNeedsToAdaptLine: number
  globalCompositeOperation?: string
  stampCount?: number
  stampScatter?: number
  jitterPosition?: number
  wobbleAmount?: number
}) => {
  // Tools whose stamps land far from the actual input path (multi-stamp
  // scatter, strong position jitter, wobble) gain nothing from re-rendering
  // the recent stroke segment: the recalculation only makes already-drawn
  // stamps vanish and reappear elsewhere. They paint straight to the layer.
  const hasRandomPlacement =
    (tool.stampScatter || 0) > 0 ||
    (tool.stampCount || 1) > 1 ||
    (tool.jitterPosition || 0) >= 0.1 ||
    (tool.wobbleAmount || 0) > 0
  return (
    !hasRandomPlacement &&
    tool.size < tool.maxSizeThatNeedsToAdaptLine &&
    (!tool.globalCompositeOperation || tool.globalCompositeOperation === 'source-over')
  )
}

export const shouldThisStepMoveAdaptLine = (state: EditorState, now = Date.now()): boolean => {
  let result = false
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

export const initCanvasOffset = (state: EditorState) => {
  state.canvas = state.canvas || ({} as EditorState['canvas'])
  state.canvas.offset = computeCanvasOffset()
}

export const initState = (initialState: EditorState): EditorState => {
  const state = JSON.parse(JSON.stringify(initialState)) as EditorState
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

interface DraggedSideSnap {
  dragValue: number
  newValue: number
  magnetismLineCoord: number | false
  diff: number
}

export const applyRationResizeMagnetism = <
  T extends Pick<ResizeModeState, 'x' | 'y' | 'w' | 'h' | 'r'>,
>(
  resizeState: T,
  magnetismCoords: LayersMagnetismCoords,
  left: boolean,
  top: boolean,
  right: boolean,
  bottom: boolean
): [T, number, number] => {
  const ratio = resizeState.w / resizeState.h
  const draggedSides: Record<string, DraggedSideSnap> = {}
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
