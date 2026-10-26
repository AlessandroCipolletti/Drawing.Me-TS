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
  shouldAdaptStrokeLine,
  shouldThisStepMoveAdaptLine,
  updateLastStepData,
} from './editorUtils'
import { TOUCH_TYPE_STYLUS, TOUCH_TYPE_FINGER } from 'main/constants'
import { sendCoworkingQuickShapeSteps, sendCoworkingStep } from './editorCoworkingBridge'
import {
  compositeMaskedDisplayWithLineOverlay,
  isLayerMasked,
  syncLayerDisplayDuringStroke,
} from './components/Layers/layerMask'
import { state as layersState } from './components/Layers/layersState'
import { hideQuickShapeBar, showQuickShapeBar } from './editorCompositor'
import {
  appendQuickShapePoint,
  buildQuickShapeStrokeSamples,
  computeQuickShapeGeometry,
  detectQuickShape,
  getQuickShapeHoldMoveTolerance,
  isQuickShapeSupportedTool,
  QUICK_SHAPE_HOLD_DURATION_MS,
  QuickShapeDetection,
  QuickShapeInputPoint,
  QuickShapeVariant,
} from './editorQuickShape'
import { EditorRefs } from './EditorView'
import { CurrentToolProps, EditorState, EditorTouchState, PointerTouchEvent } from './editorTypes'

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
  let nearRulerLocked = false
  let lineCanvasHiddenForMask = false

  let preStrokeCanvas: HTMLCanvasElement | OffscreenCanvas | null = null
  let preStrokeCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
  let quickShapePoints: QuickShapeInputPoint[] = []
  let quickShapeFreehandSteps: StrokeSample[] = []
  let quickShapeCurrentSteps: StrokeSample[] = []
  let quickShapeHoldTimer: ReturnType<typeof setTimeout> | null = null
  let quickShapeHoldAnchorX = 0
  let quickShapeHoldAnchorY = 0
  let quickShapeSnapped = false
  let quickShapeCommitted = false
  let quickShapeLayerId = ''
  let quickShapeToolSnapshot: CurrentToolProps | null = null
  let quickShapeDetection: QuickShapeDetection | null = null
  let quickShapeActiveVariant: QuickShapeVariant = 'line'
  let quickShapeLastDragPoint: [number, number] | undefined = undefined

  const clearQuickShapeHoldTimer = () => {
    if (quickShapeHoldTimer !== null) {
      clearTimeout(quickShapeHoldTimer)
      quickShapeHoldTimer = null
    }
  }

  const dismissQuickShape = () => {
    clearQuickShapeHoldTimer()
    quickShapeSnapped = false
    quickShapeCommitted = false
    quickShapeDetection = null
    quickShapePoints = []
    quickShapeFreehandSteps = []
    quickShapeCurrentSteps = []
    quickShapeLastDragPoint = undefined
    hideQuickShapeBar(state, refs)
  }

  const capturePreStrokeSnapshot = (sourceCanvas: HTMLCanvasElement | undefined) => {
    if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return
    const w = sourceCanvas.width
    const h = sourceCanvas.height
    if (!preStrokeCanvas) {
      if (typeof OffscreenCanvas !== 'undefined') {
        preStrokeCanvas = new OffscreenCanvas(w, h)
      } else if (typeof document !== 'undefined') {
        preStrokeCanvas = document.createElement('canvas')
      }
      if (preStrokeCanvas) {
        preStrokeCtx = preStrokeCanvas.getContext('2d') as
          CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
      }
    }
    if (!preStrokeCanvas || !preStrokeCtx) return
    if (preStrokeCanvas.width !== w || preStrokeCanvas.height !== h) {
      preStrokeCanvas.width = w
      preStrokeCanvas.height = h
    }
    preStrokeCtx.clearRect(0, 0, w, h)
    preStrokeCtx.drawImage(sourceCanvas, 0, 0)
  }

  const restorePreStrokeToContext = (targetCtx: ExtendedCanvasContext) => {
    if (!targetCtx?.canvas) return
    const prevGco = targetCtx.globalCompositeOperation
    const prevAlpha = targetCtx.globalAlpha
    targetCtx.globalCompositeOperation = 'source-over'
    targetCtx.globalAlpha = 1
    targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height)
    if (preStrokeCanvas && preStrokeCanvas.width > 0 && preStrokeCanvas.height > 0) {
      targetCtx.drawImage(preStrokeCanvas as CanvasImageSource, 0, 0)
    }
    targetCtx.globalCompositeOperation = prevGco
    targetCtx.globalAlpha = prevAlpha
  }

  const saveStepHistory = () => {
    Layers.addLayerHistoryContentChangedStep()
  }

  const refreshStrokeLayerDisplay = (layerId: string) => {
    if (!layersState.layers[layerId]) return
    if (isLayerMasked(layerId) && refs.canvasForLine) {
      compositeMaskedDisplayWithLineOverlay(refs.canvasForLine, layerId)
    } else {
      syncLayerDisplayDuringStroke(layerId)
    }
  }

  const setLineCanvasHiddenForMask = (hidden: boolean) => {
    if (!refs.canvasForLine) return
    lineCanvasHiddenForMask = hidden
    if (hidden) {
      refs.canvasForLine.classList.add('displayNone')
      return
    }
    const layerId = Layers.getCurrentSelectedLayerId()
    const active = Boolean(
      layerId && layersState.layers[layerId]?.active && !isLayerMasked(layerId)
    )
    refs.canvasForLine.classList.toggle('displayNone', !active)
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
        const layerId = Layers.getCurrentSelectedLayerId()
        if (layerId) syncLayerDisplayDuringStroke(layerId)
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
          res.then(() => {
            const layerId = Layers.getCurrentSelectedLayerId()
            if (layerId) syncLayerDisplayDuringStroke(layerId)
            saveStepHistory()
          })
        }
      }
      if (hasBeenUsed && Coworking.isOpen() && sendForCoworking) {
        sendCoworkingStep(state, { type: 'start', x, y }, true)
      }
    }
  }

  const shouldUseLineAdaptation = () => shouldAdaptStrokeLine(state.currentToolProps)

  const paintQuickShapeVariant = (
    variant: QuickShapeVariant,
    dragPoint?: [number, number],
    pulse = false
  ) => {
    if (!quickShapeDetection || !quickShapeToolSnapshot || !quickShapeLayerId) return
    const targetCtx = Layers.getLayerContext(quickShapeLayerId) || refs.layerContext
    if (!targetCtx) return

    restorePreStrokeToContext(targetCtx)
    if (refs.contextForLine && refs.canvasForLine) {
      refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
    }

    if (variant === 'freehand') {
      for (const step of quickShapeFreehandSteps) {
        drawStrokeSample(targetCtx, step, quickShapeToolSnapshot, true)
      }
      targetCtx.globalAlpha = 1
      targetCtx.globalCompositeOperation = 'source-over'
      quickShapeCurrentSteps = quickShapeFreehandSteps
      const geom = computeQuickShapeGeometry(
        quickShapeDetection,
        quickShapeDetection.defaultVariant,
        dragPoint
      )
      showQuickShapeBar(
        state,
        refs,
        quickShapeDetection.availableVariants,
        'freehand',
        geom.bounds,
        false
      )
      refreshStrokeLayerDisplay(quickShapeLayerId)
      return
    }

    const geom = computeQuickShapeGeometry(quickShapeDetection, variant, dragPoint)
    const samples = buildQuickShapeStrokeSamples(
      geom.waypoints,
      geom.closed,
      quickShapeDetection.style,
      quickShapeToolSnapshot
    )
    for (const step of samples) {
      drawStrokeSample(targetCtx, step, quickShapeToolSnapshot, true)
    }
    targetCtx.globalAlpha = 1
    targetCtx.globalCompositeOperation = 'source-over'
    quickShapeCurrentSteps = samples

    showQuickShapeBar(
      state,
      refs,
      quickShapeDetection.availableVariants,
      variant,
      geom.bounds,
      pulse
    )
    refreshStrokeLayerDisplay(quickShapeLayerId)
  }

  const triggerQuickShapeOnHold = () => {
    quickShapeHoldTimer = null
    if (
      !state.currentTouch.isDown ||
      state.currentTouch.isNearRuler ||
      !state.currentTouch.drewSomething ||
      quickShapeSnapped ||
      !isQuickShapeSupportedTool(state.currentToolProps) ||
      !refs.layerContext
    ) {
      return
    }

    if (
      shouldUseLineAdaptation() &&
      typeof state.lastAdaptedStep.x === 'number' &&
      (state.lastStep.x !== state.lastAdaptedStep.x || state.lastStep.y !== state.lastAdaptedStep.y)
    ) {
      const tailStep = getStepData(
        state.currentToolProps,
        state.currentTouch,
        state.lastAdaptedStep
      )
      quickShapeFreehandSteps.push({ ...tailStep, type: 'end' })
    }

    const detection = detectQuickShape(quickShapePoints, state.canvas.scale)
    if (!detection) return

    quickShapeDetection = detection
    quickShapeSnapped = true
    quickShapeCommitted = false
    quickShapeActiveVariant = detection.defaultVariant
    quickShapeLayerId = Layers.getCurrentSelectedLayerId()
    quickShapeToolSnapshot = { ...state.currentToolProps }
    quickShapeLastDragPoint = [state.currentTouch.x, state.currentTouch.y]
    state.hasPredictedOverlay = false

    paintQuickShapeVariant(quickShapeActiveVariant, undefined, true)
  }

  const armQuickShapeHoldTimer = () => {
    clearQuickShapeHoldTimer()
    if (
      !state.currentTouch.isDown ||
      state.currentTouch.isNearRuler ||
      quickShapeSnapped ||
      !isQuickShapeSupportedTool(state.currentToolProps)
    ) {
      return
    }
    quickShapeHoldTimer = setTimeout(triggerQuickShapeOnHold, QUICK_SHAPE_HOLD_DURATION_MS)
  }

  const applyQuickShapeVariant = (variant: QuickShapeVariant) => {
    if (
      !quickShapeDetection ||
      !quickShapeCommitted ||
      !quickShapeLayerId ||
      Layers.getCurrentSelectedLayerId() !== quickShapeLayerId
    ) {
      dismissQuickShape()
      return
    }
    quickShapeActiveVariant = variant
    paintQuickShapeVariant(variant, quickShapeLastDragPoint, false)
    void Layers.replaceLatestLayerHistoryContentStep(quickShapeLayerId)
    if (Coworking.isOpen() && quickShapeCurrentSteps.length > 0) {
      sendCoworkingQuickShapeSteps(state, quickShapeCurrentSteps, 'last')
    }
  }

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
      if (!state.currentTouch.isNearRuler && isQuickShapeSupportedTool(state.currentToolProps)) {
        quickShapeFreehandSteps = [{ ...stepData, type: 'start' }]
        quickShapePoints = []
        appendQuickShapePoint(quickShapePoints, {
          x: stepData.x,
          y: stepData.y,
          size: stepData.size,
          alpha: stepData.alpha,
          rotation: stepData.rotation,
          aspectRatio: stepData.aspectRatio ?? 1,
        })
        quickShapeHoldAnchorX = stepData.x
        quickShapeHoldAnchorY = stepData.y
      }
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
    if (
      !state.currentTouch.isNearRuler &&
      !quickShapeSnapped &&
      isQuickShapeSupportedTool(state.currentToolProps)
    ) {
      appendQuickShapePoint(quickShapePoints, {
        x: stepData.x,
        y: stepData.y,
        size: stepData.size,
        alpha: stepData.alpha,
        rotation: stepData.rotation,
        aspectRatio: stepData.aspectRatio ?? 1,
      })
      if (sendDataForCoworking && thisStepHasDoneSomething) {
        quickShapeFreehandSteps.push({ ...stepData, type: 'move' })
      }
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
      const layerId = Layers.getCurrentSelectedLayerId()
      if (layerId) refreshStrokeLayerDisplay(layerId)
      requestAnimationFrame(saveStepHistory)
    }
    if (lineCanvasHiddenForMask) {
      setLineCanvasHiddenForMask(false)
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
    const predBlend =
      typeof state.currentToolProps.predictedEventsBlend === 'number' &&
      !Number.isNaN(state.currentToolProps.predictedEventsBlend)
        ? state.currentToolProps.predictedEventsBlend
        : 1
    if (predBlend <= 0) {
      return
    }
    const predToolProps =
      predBlend === 1
        ? state.currentToolProps
        : {
            ...state.currentToolProps,
            flow: (state.currentToolProps.flow ?? 1) * predBlend,
          }
    const savedTouch = { ...state.currentTouch }
    const savedLastStep = { ...state.lastStep }
    refs.contextForLine.lastDrawCoordX = refs.layerContext.lastDrawCoordX
    refs.contextForLine.lastDrawCoordY = refs.layerContext.lastDrawCoordY

    for (const predEvent of sampleTouchEvent.predictedSamples) {
      updateCurrentTouchData(state, predEvent, Params.eventMove)
      const predStep = getStepData(state.currentToolProps, state.currentTouch, state.lastStep)
      drawStepMove(refs.contextForLine, predStep, predToolProps)
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

    if (quickShapeSnapped && quickShapeDetection) {
      updateCurrentTouchData(state, sampleTouchEvent, Params.eventMove, false, false, true)
      const nextDragPoint: [number, number] = [state.currentTouch.x, state.currentTouch.y]
      quickShapeLastDragPoint = nextDragPoint
      updateCursorPosition(
        quickShapeDetection.style.size,
        state.currentTouch.x,
        state.currentTouch.y
      )
      paintQuickShapeVariant(quickShapeActiveVariant, nextDragPoint, false)
      return
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

    if (
      !state.currentTouch.isNearRuler &&
      isQuickShapeSupportedTool(state.currentToolProps) &&
      state.currentTouch.drewSomething
    ) {
      const distFromHold = Math.hypot(
        state.currentTouch.x - quickShapeHoldAnchorX,
        state.currentTouch.y - quickShapeHoldAnchorY
      )
      if (
        distFromHold > getQuickShapeHoldMoveTolerance(state.canvas.scale) ||
        quickShapeHoldTimer === null
      ) {
        quickShapeHoldAnchorX = state.currentTouch.x
        quickShapeHoldAnchorY = state.currentTouch.y
        armQuickShapeHoldTimer()
      }
    }
  }

  const onStepTouchStart = (touchEvent: PointerTouchEvent) => {
    if (!refs.contextForLine || !refs.canvasForLine || !refs.layerContext) return
    dismissQuickShape()
    state.currentTouch = { ...initialCurrentTouch }
    state.lastStep = {}
    state.lastAdaptedStep = {}
    state.hasPredictedOverlay = false
    updateCurrentTouchType(state, touchEvent)

    state.lastLineAdaptationTimestamp = Date.now()
    state.stepsSinceLastLineAdaptation = 0

    updateCurrentTouchData(state, touchEvent, Params.eventStart)
    if (state.currentTouch.isNearRuler && !Ruler.isHeldByFingers()) {
      Ruler.lock()
      nearRulerLocked = true
    } else if (
      !state.currentTouch.isNearRuler &&
      isQuickShapeSupportedTool(state.currentToolProps)
    ) {
      capturePreStrokeSnapshot(refs.layerContext.canvas)
    }
    handleTouchStartStep(refs.layerContext)

    if (shouldUseLineAdaptation()) {
      state.lastAdaptedStep = { ...state.lastStep }
      state.pxDistanceSinceLastLineAdaptation = 0
      refs.contextForLine.lastDrawCoordX = refs.layerContext.lastDrawCoordX
      refs.contextForLine.lastDrawCoordY = refs.layerContext.lastDrawCoordY
      refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
    }

    const layerId = Layers.getCurrentSelectedLayerId()
    if (layerId && isLayerMasked(layerId) && state.currentTouch.isDown) {
      setLineCanvasHiddenForMask(true)
    }
    if (layerId && state.currentTouch.isDown) {
      refreshStrokeLayerDisplay(layerId)
    }
  }

  const onStepTouchMove = (touchEvent: PointerTouchEvent) => {
    runCoalescedStepTouchMove(touchEvent, processSingleStepTouchMove)
    const layerId = Layers.getCurrentSelectedLayerId()
    if (layerId) refreshStrokeLayerDisplay(layerId)
  }

  const onStepTouchEnd = (e: PointerTouchEvent) => {
    clearQuickShapeHoldTimer()
    if (!refs.contextForLine || !refs.canvasForLine || !refs.layerContext) return
    if (state.hasPredictedOverlay) {
      refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
      state.hasPredictedOverlay = false
    }

    if (quickShapeSnapped && quickShapeDetection) {
      refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
      if (nearRulerLocked) {
        Ruler.unlock()
        nearRulerLocked = false
      }
      state.currentTouch.isDown = state.currentTouch.isNearRuler = false
      refs.toolCursor?.classList.add('displayNone')
      quickShapeCommitted = true

      if (Coworking.isOpen() && quickShapeCurrentSteps.length > 0) {
        sendCoworkingQuickShapeSteps(state, quickShapeCurrentSteps, 'current')
      }
      const layerId = Layers.getCurrentSelectedLayerId()
      if (layerId) refreshStrokeLayerDisplay(layerId)
      requestAnimationFrame(saveStepHistory)
      if (lineCanvasHiddenForMask) {
        setLineCanvasHiddenForMask(false)
      }
      return
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
        const layerId = Layers.getCurrentSelectedLayerId()
        if (layerId) refreshStrokeLayerDisplay(layerId)
        state.lastAdaptedStep = { ...state.lastStep }
      }
    }

    if (nearRulerLocked) {
      Ruler.unlock()
      nearRulerLocked = false
    }
    updateCurrentTouchData(state, e, Params.eventEnd)
    handleTouchEndStep(refs.layerContext)
    if (lineCanvasHiddenForMask) {
      setLineCanvasHiddenForMask(false)
    }
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
      const layerId = Layers.getCurrentSelectedLayerId()
      if (layerId) refreshStrokeLayerDisplay(layerId)
    }
  }

  const makeTouchMoveNearRuler = (touchEvent: PointerTouchEvent, x: number, y: number) => {
    if (state.currentTouch.isDown && refs.layerContext) {
      updateCurrentTouchData(state, touchEvent, Params.eventMove, x, y)
      handleTouchMoveStep(refs.layerContext, true)
      const layerId = Layers.getCurrentSelectedLayerId()
      if (layerId) refreshStrokeLayerDisplay(layerId)
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
    applyQuickShapeVariant,
    dismissQuickShape,
  }
}
