import Params from 'main/Params'
import * as Coworking from 'modules/Coworking'
import * as ColorPicker from './components/ColorPicker'
import * as Toolbar from './components/Toolbar'
import * as Layers from './components/Layers'
import * as Tools from './components/Tools'
import * as Ruler from './components/Ruler'
import { round, getOriginalCoordsFromScaleRotation } from 'utils/mathUtils'
import {
  fillWithBucket,
  fillCompletely,
  drawStrokeSample,
  ExtendedCanvasContext,
  StrokeSample,
  StrokeToolParams,
} from 'utils/canvasUtils'
import {
  updateCurrentTouchData,
  getStepData,
  shouldThisStepMoveAdaptLine,
  updateLastStepData,
} from './editorUtils'
import { TOUCH_TYPE_STYLUS, TOUCH_TYPE_FINGER } from 'main/constants'
import { sendCoworkingStep } from './editorCoworkingBridge'
import { EditorRefs } from './EditorView'
import { EditorState, EditorTouchState, PointerTouchEvent } from './editorTypes'

let cursorRafId = 0
let pendingCursorSize = 0
let pendingCursorX = 0
let pendingCursorY = 0

export const runCoalescedStepTouchMove = <T>(
  touchEvent: T & { coalescedSamples?: T[] },
  processSample: (sample: T) => void
) => {
  const coalescedSamples = touchEvent?.coalescedSamples
  if (Array.isArray(coalescedSamples) && coalescedSamples.length > 1) {
    for (let i = 0; i < coalescedSamples.length; i++) {
      processSample(coalescedSamples[i])
    }
  } else {
    processSample(touchEvent)
  }
}

export const drawStepStart = (
  context: ExtendedCanvasContext,
  stepData: StrokeSample,
  tool: StrokeToolParams
) => drawStrokeSample(context, { ...stepData, type: 'start' }, tool, true)

export const drawStepMove = (
  context: ExtendedCanvasContext,
  stepData: StrokeSample,
  tool: StrokeToolParams
) => drawStrokeSample(context, { ...stepData, type: 'move' }, tool, true)

export const drawStepEnd = (
  context: ExtendedCanvasContext,
  stepData: StrokeSample,
  tool: StrokeToolParams
) => drawStrokeSample(context, { ...stepData, type: 'end' }, tool, true)

export const updateCurrentTouchType = (state: EditorState, touchEvent?: PointerTouchEvent) => {
  state.currentTouch.type =
    touchEvent?.touchType === TOUCH_TYPE_STYLUS ? TOUCH_TYPE_STYLUS : TOUCH_TYPE_FINGER
  state.currentTouch.touchType = state.currentTouch.type
  if (!state.currentDeviceHasStylus && state.currentTouch.type === TOUCH_TYPE_STYLUS) {
    state.currentDeviceHasStylus = true
  }
}

export interface StrokeSessionDeps {
  state: EditorState
  initialCurrentTouch: EditorTouchState
  refs: EditorRefs
  coordsAreInsideLayer: (x: number, y: number) => boolean
  setToolColor: (color: string | false, randomColor: boolean) => void
}

export const createEditorStrokeSession = (deps: StrokeSessionDeps) => {
  const { state, initialCurrentTouch, refs, coordsAreInsideLayer, setToolColor } = deps

  const saveStepHistory = () => {
    Layers.addLayerHistoryContentChangedStep()
  }

  const updateCursorPosition = (size: number, x: number, y: number) => {
    if (state.currentToolProps.cursor && refs.toolCursor) {
      pendingCursorSize = size
      pendingCursorX = x
      pendingCursorY = y
      if (!cursorRafId) {
        cursorRafId = requestAnimationFrame(() => {
          cursorRafId = 0
          if (state.currentToolProps.cursor && refs.toolCursor && state.currentTouch.isDown) {
            refs.toolCursor.style.cssText = `
              width: ${pendingCursorSize / Params.pxScale}px;
              height: ${pendingCursorSize / Params.pxScale}px;
              left: ${pendingCursorX / Params.pxScale}px;
              top: ${pendingCursorY / Params.pxScale}px;
            `
            refs.toolCursor.classList.remove('displayNone')
          }
        })
      }
    }
  }

  const useBucket = async (
    context: ExtendedCanvasContext,
    x: number,
    y: number,
    color: string,
    sendForCoworking = true
  ) => {
    if (coordsAreInsideLayer(x, y)) {
      let hasBeenUsed = false
      if (Layers.isYourLayerEmpty()) {
        fillCompletely(context, color, context.canvas.width, context.canvas.height)
        hasBeenUsed = true
        saveStepHistory()
      } else {
        const res = fillWithBucket(
          context,
          x,
          y,
          color,
          context.canvas.width,
          context.canvas.height
        )
        if (res) {
          hasBeenUsed = true
          res.then(saveStepHistory)
        }
      }
      if (hasBeenUsed && Coworking.isOpen() && sendForCoworking) {
        sendCoworkingStep(state, { type: 'start', x, y }, true)
      }
    }
  }

  const shouldUseLineAdaptation = () =>
    state.currentToolProps.size < state.currentToolProps.maxSizeThatNeedsToAdaptLine &&
    (!state.currentToolProps.globalCompositeOperation ||
      state.currentToolProps.globalCompositeOperation === 'source-over')

  const handleTouchStartStep = (context: ExtendedCanvasContext) => {
    state.currentTouch.drewSomething = false
    const stepData = getStepData(state.currentToolProps, state.currentTouch, state.lastStep)

    if (
      state.currentToolGCO !== 'destination-out' &&
      (state.currentToolProps.randomColor || !state.currentToolProps.color)
    ) {
      setToolColor(ColorPicker.getRandomColor(), true)
    }
    updateCursorPosition(stepData.size, state.currentTouch.x, state.currentTouch.y)
    Tools.closeVersions()
    Layers.closeParams()
    Toolbar.closeParams()
    ColorPicker.closeParams()
    ColorPicker.confirmLastAddedColorIfNeeded()

    if (state.currentToolProps.name === 'bucket') {
      useBucket(context, stepData.x, stepData.y, state.currentToolProps.color || '')
    } else {
      state.currentTouch.isDown = true
      const thisStepHasDoneSomething = drawStepStart(context, stepData, state.currentToolProps)
      state.currentTouch.drewSomething =
        state.currentTouch.drewSomething ||
        (thisStepHasDoneSomething && coordsAreInsideLayer(stepData.x, stepData.y))
      if (thisStepHasDoneSomething && Coworking.isOpen()) {
        sendCoworkingStep(state, stepData)
      }
      updateLastStepData(state, stepData)
    }
  }

  const handleTouchMoveStep = (context: ExtendedCanvasContext, sendDataForCoworking: boolean) => {
    if (state.currentTouch.isDown === false) {
      return
    }
    const stepData = getStepData(state.currentToolProps, state.currentTouch, state.lastStep)
    updateCursorPosition(stepData.size, state.currentTouch.x, state.currentTouch.y)

    const thisStepHasDoneSomething = drawStepMove(context, stepData, state.currentToolProps)
    state.currentTouch.drewSomething =
      state.currentTouch.drewSomething ||
      (thisStepHasDoneSomething && coordsAreInsideLayer(stepData.x, stepData.y))
    if (sendDataForCoworking && thisStepHasDoneSomething && Coworking.isOpen()) {
      sendCoworkingStep(
        state,
        stepData,
        state.currentTouch.drewSomething &&
          state.stepsSinceLastCoworkingUpdate >= state.currentToolProps.stepsToUpdateCoworking - 1
      )
    }
    updateLastStepData(state, stepData)
  }

  const handleTouchEndStep = (context: ExtendedCanvasContext) => {
    if (state.currentTouch.isDown === false) {
      return
    }
    state.currentTouch.isDown = state.currentTouch.isNearRuler = false
    refs.toolCursor?.classList.add('displayNone')

    let stepData: Partial<StrokeSample> = { type: 'end' }

    const hasMovedFromLastStep =
      state.currentTouch.x !== state.lastStep.x || state.currentTouch.y !== state.lastStep.y
    const hasUnfinishedMidSegment =
      Boolean(state.currentToolProps.completeEndSegment) &&
      typeof state.lastStep.x === 'number' &&
      typeof state.lastStep.midX === 'number' &&
      (state.lastStep.x !== state.lastStep.midX || state.lastStep.y !== state.lastStep.midY)

    if (hasMovedFromLastStep || hasUnfinishedMidSegment) {
      const fullStep = getStepData(state.currentToolProps, state.currentTouch, state.lastStep)
      stepData = fullStep
      const thisStepHasDoneSomething = drawStepEnd(context, fullStep, state.currentToolProps)
      state.currentTouch.drewSomething =
        state.currentTouch.drewSomething ||
        (thisStepHasDoneSomething && coordsAreInsideLayer(fullStep.x, fullStep.y))
    }

    if (Coworking.isOpen()) {
      if (state.currentTouch.drewSomething) {
        sendCoworkingStep(state, stepData, true)
      } else {
        Coworking.clearSteps()
        state.stepsSinceLastCoworkingUpdate = 0
      }
    }

    if (state.currentTouch.drewSomething) {
      requestAnimationFrame(saveStepHistory)
    }
  }

  const renderPredictedOverlayIfNeeded = (sampleTouchEvent: PointerTouchEvent) => {
    if (
      !refs.layerContext ||
      !refs.contextForLine ||
      !refs.canvasForLine ||
      !state.currentTouch.isDown ||
      state.currentTouch.isNearRuler ||
      !state.currentToolProps.usePredictedEvents ||
      state.currentToolGCO === 'destination-out' ||
      !sampleTouchEvent.predictedSamples?.length
    ) {
      return
    }
    const savedTouch = { ...state.currentTouch }
    const savedLastStep = { ...state.lastStep }
    refs.contextForLine.lastDrawCoordX = refs.layerContext.lastDrawCoordX
    refs.contextForLine.lastDrawCoordY = refs.layerContext.lastDrawCoordY

    for (const predEvent of sampleTouchEvent.predictedSamples) {
      updateCurrentTouchData(state, predEvent, Params.eventMove)
      const predStep = getStepData(state.currentToolProps, state.currentTouch, state.lastStep)
      drawStepMove(refs.contextForLine, predStep, state.currentToolProps)
      updateLastStepData(state, predStep)
    }

    state.currentTouch = savedTouch
    state.lastStep = savedLastStep
    state.hasPredictedOverlay = true
  }

  const processSingleStepTouchMove = (sampleTouchEvent: PointerTouchEvent) => {
    if (!refs.layerContext || !refs.contextForLine || !refs.canvasForLine) return
    if (state.hasPredictedOverlay) {
      refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
      state.hasPredictedOverlay = false
    }
    updateCurrentTouchData(state, sampleTouchEvent, Params.eventMove)

    if (shouldUseLineAdaptation()) {
      const adaptedStepLine = shouldThisStepMoveAdaptLine(state)
      if (adaptedStepLine) {
        state.lastStep = { ...state.lastAdaptedStep }
        updateCurrentTouchData(state, sampleTouchEvent, Params.eventMove, false, false, true)
      }
      handleTouchMoveStep(
        adaptedStepLine ? refs.layerContext : refs.contextForLine,
        adaptedStepLine
      )

      if (adaptedStepLine) {
        state.lastAdaptedStep = { ...state.lastStep }
        refs.contextForLine.lastDrawCoordX = refs.layerContext.lastDrawCoordX
        refs.contextForLine.lastDrawCoordY = refs.layerContext.lastDrawCoordY
        refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
        renderPredictedOverlayIfNeeded(sampleTouchEvent)
      }
    } else {
      handleTouchMoveStep(refs.layerContext, true)
      renderPredictedOverlayIfNeeded(sampleTouchEvent)
    }
  }

  const onStepTouchStart = (touchEvent: PointerTouchEvent) => {
    if (!refs.contextForLine || !refs.canvasForLine || !refs.layerContext) return
    state.currentTouch = { ...initialCurrentTouch }
    state.lastStep = {}
    state.lastAdaptedStep = {}
    state.hasPredictedOverlay = false
    updateCurrentTouchType(state, touchEvent)

    state.lastLineAdaptationTimestamp = Date.now()
    state.stepsSinceLastLineAdaptation = 0

    updateCurrentTouchData(state, touchEvent, Params.eventStart)
    if (state.currentTouch.isNearRuler) {
      Ruler.lock()
    }
    handleTouchStartStep(refs.layerContext)

    if (shouldUseLineAdaptation()) {
      state.lastAdaptedStep = { ...state.lastStep }
      state.pxDistanceSinceLastLineAdaptation = 0
      refs.contextForLine.lastDrawCoordX = refs.layerContext.lastDrawCoordX
      refs.contextForLine.lastDrawCoordY = refs.layerContext.lastDrawCoordY
      refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
    }
  }

  const onStepTouchMove = (touchEvent: PointerTouchEvent) => {
    runCoalescedStepTouchMove(touchEvent, processSingleStepTouchMove)
  }

  const onStepTouchEnd = (e: PointerTouchEvent) => {
    if (!refs.contextForLine || !refs.canvasForLine || !refs.layerContext) return
    if (state.hasPredictedOverlay) {
      refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
      state.hasPredictedOverlay = false
    }
    if (shouldUseLineAdaptation()) {
      refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
      if (
        typeof state.lastAdaptedStep.x === 'number' &&
        (state.lastStep.x !== state.lastAdaptedStep.x ||
          state.lastStep.y !== state.lastAdaptedStep.y)
      ) {
        state.lastStep = { ...state.lastAdaptedStep }
        updateCurrentTouchData(state, e, Params.eventMove)
        handleTouchMoveStep(refs.layerContext, true)
        state.lastAdaptedStep = { ...state.lastStep }
      }
    }

    if (state.currentTouch.isNearRuler) {
      Ruler.unlock()
    }
    updateCurrentTouchData(state, e, Params.eventEnd)
    handleTouchEndStep(refs.layerContext)
  }

  const makeTouchStartNearRuler = (touchEvent: PointerTouchEvent, x: number, y: number) => {
    if (
      state.currentTouch.isDown === false &&
      state.currentLayerIsActive &&
      !state.resizeMode.active &&
      state.currentToolProps.name !== 'pipette' &&
      refs.layerContext
    ) {
      state.currentTouch = { ...initialCurrentTouch }
      state.lastStep = {}
      state.lastAdaptedStep = {}
      updateCurrentTouchType(state, touchEvent)
      state.currentTouch.isNearRuler = true
      updateCurrentTouchData(state, touchEvent, Params.eventStart, x, y)
      handleTouchStartStep(refs.layerContext)
    }
  }

  const makeTouchMoveNearRuler = (touchEvent: PointerTouchEvent, x: number, y: number) => {
    if (state.currentTouch.isDown && refs.layerContext) {
      updateCurrentTouchData(state, touchEvent, Params.eventMove, x, y)
      handleTouchMoveStep(refs.layerContext, true)
    }
  }

  const makeTouchEndNearRuler = (
    touchOrX?: PointerTouchEvent | number,
    maybeX?: number,
    maybeY?: number
  ) => {
    if (!refs.layerContext) return
    if (typeof touchOrX === 'object' && typeof maybeX === 'number' && typeof maybeY === 'number') {
      updateCurrentTouchData(state, touchOrX, Params.eventEnd, maybeX, maybeY)
    } else if (typeof touchOrX === 'number' && touchOrX !== 0 && typeof maybeX === 'number') {
      let x = touchOrX
      let y = maybeX
      if (state.canvas.scale !== 1 || state.canvas.rotation !== 0) {
        ;[x, y] = getOriginalCoordsFromScaleRotation(
          x,
          y,
          state.canvas.originCoordX,
          state.canvas.originCoordY,
          state.canvas.scale,
          state.canvas.rotation
        )
      }
      state.currentTouch.x = round(x * Params.pxScale, 1)
      state.currentTouch.y = round(y * Params.pxScale, 1)
    }
    handleTouchEndStep(refs.layerContext)
  }

  return {
    onStepTouchStart,
    onStepTouchMove,
    onStepTouchEnd,
    makeTouchStartNearRuler,
    makeTouchMoveNearRuler,
    makeTouchEndNearRuler,
  }
}
