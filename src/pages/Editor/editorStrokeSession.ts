import Params from 'main/Params'
import * as Coworking from 'modules/Coworking'
import * as ColorPicker from './components/ColorPicker'
import * as Toolbar from './components/Toolbar'
import * as Layers from './components/Layers'
import * as Tools from './components/Tools'
import * as Ruler from './components/Ruler'
import { round, getOriginalCoordsFromScaleRotation } from 'utils/mathUtils'
import {
  fillCompletely,
  ExtendedCanvasContext,
  StrokeSample,
  StrokeToolParams,
  type BucketFillOptions,
} from 'utils/canvasUtils'
import { fillActiveLayerWithBucketAt } from './bucketFillPipeline'
import {
  updateCurrentTouchData,
  getStepData,
  shouldAdaptStrokeLine,
  shouldThisStepMoveAdaptLine,
  updateLastStepData,
} from './editorUtils'
import { TOUCH_TYPE_STYLUS, TOUCH_TYPE_FINGER } from 'main/constants'
import {
  sendCoworkingGradientFill,
  sendCoworkingQuickShapeSteps,
  sendCoworkingStep,
} from './editorCoworkingBridge'
import {
  clearGradientGuideOverlay,
  getGradientHandleHitRadiusPx,
  GradientFillSpec,
  hitTestGradientEndpoint,
  isGradientDragValid,
  paintGradientFillOnContext,
  renderGradientGuideOverlay,
} from './gradientFill'
import {
  compositeMaskedDisplayWithLineOverlay,
  getClipMaskCanvas,
  isLayerMasked,
  syncLayerDisplayDuringStroke,
} from './components/Layers/layerMask'
import { applyLassoClipPath } from './components/Layers/layerLasso'
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
import {
  endTextBoxHandleDrag,
  moveTextBoxHandleDrag,
  startOrManipulateTextAtPoint,
} from './text/textSession'
import { CurrentToolProps, EditorState, EditorTouchState, PointerTouchEvent } from './editorTypes'
import {
  createSmudgeStrokeSession,
  getSmudgeCursorClassSuffix,
  getSmudgeCursorSize,
  resetSmudgeStrokeSession,
  smudgeStrokeStep,
  smudgeTouchTypeToInputKind,
} from './smudgeKernel'
import {
  createEffectBrushStrokeSession,
  effectBrushStrokeStep,
  hasPendingEffectDab,
  resetEffectBrushStrokeSession,
} from './effectBrushKernel'
import {
  clampSignedIntensity,
  isEffectBrushToolName,
  type EffectBrushKind,
} from './effectBrushFilters'
import { drawStrokeWithGuides } from './guides/guidesStroke'

let cursorRafId = 0
let pendingCursorSize = 0
let pendingCursorX = 0
let pendingCursorY = 0
let pendingHistoryRafId: number | null = null

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
) => drawStrokeWithGuides(context, { ...stepData, type: 'start' }, tool, true)

export const drawStepMove = (
  context: ExtendedCanvasContext,
  stepData: StrokeSample,
  tool: StrokeToolParams
) => drawStrokeWithGuides(context, { ...stepData, type: 'move' }, tool, true)

export const drawStepEnd = (
  context: ExtendedCanvasContext,
  stepData: StrokeSample,
  tool: StrokeToolParams
) => drawStrokeWithGuides(context, { ...stepData, type: 'end' }, tool, true)

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
  const smudgeSession = createSmudgeStrokeSession()
  const effectSession = createEffectBrushStrokeSession()
  const isSmudgeTool = () => state.currentToolProps.name === 'smudge'
  const isEffectTool = () => isEffectBrushToolName(state.currentToolProps.name)
  const getEffectBaseIntensity = () => {
    const raw =
      state.currentToolProps.effectIntensity ?? state.currentToolProps.customProps?.effectIntensity
    return typeof raw === 'number' && Number.isFinite(raw) ? clampSignedIntensity(raw) : 10
  }
  let nearRulerLocked = false
  let lineCanvasHiddenForMask = false

  let preStrokeCanvas: HTMLCanvasElement | OffscreenCanvas | null = null
  let preStrokeCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
  let preStrokeOutsideCanvas: HTMLCanvasElement | OffscreenCanvas | null = null
  let preStrokeOutsideCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null =
    null
  let lassoClipActive = false
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
  let gradientSnapshotCanvas: HTMLCanvasElement | null = null

  const currentGradientSpec = (): GradientFillSpec => ({
    kind: state.gradientMode.kind,
    x0: state.gradientMode.x0,
    y0: state.gradientMode.y0,
    x1: state.gradientMode.x1,
    y1: state.gradientMode.y1,
    color1: state.gradientMode.color1,
    color2: state.gradientMode.color2,
    opacity: 1,
  })

  const captureGradientSnapshots = (sourceCanvas: HTMLCanvasElement) => {
    const w = sourceCanvas.width
    const h = sourceCanvas.height
    if (!gradientSnapshotCanvas) {
      gradientSnapshotCanvas = document.createElement('canvas')
    }
    if (gradientSnapshotCanvas.width !== w || gradientSnapshotCanvas.height !== h) {
      gradientSnapshotCanvas.width = w
      gradientSnapshotCanvas.height = h
    }
    const snapCtx = gradientSnapshotCanvas.getContext('2d')
    snapCtx?.clearRect(0, 0, w, h)
    snapCtx?.drawImage(sourceCanvas, 0, 0)
  }

  const clipGradientToActiveSelection = (ctx: CanvasRenderingContext2D) => {
    if (!Layers.hasActiveLassoSelection()) return
    const lassoSel = Layers.getActiveLassoSelection()
    if (!lassoSel || lassoSel.points.length < 3) return
    applyLassoClipPath(ctx, lassoSel.points, lassoSel.inverted, lassoSel.rings)
  }

  const renderActiveGradientGuide = (spec: GradientFillSpec) => {
    renderGradientGuideOverlay(
      refs.gradientOverlay,
      spec,
      state.canvas.scale,
      getClipMaskCanvas(state.gradientMode.layerId)
    )
  }

  const repaintActiveGradientPreview = () => {
    if (
      (!state.gradientMode.hasActiveEdit && !state.gradientMode.isDragging) ||
      !state.gradientMode.layerId
    ) {
      return
    }
    const targetCtx = Layers.getLayerContext(state.gradientMode.layerId) || refs.layerContext
    if (!targetCtx) return
    const spec = currentGradientSpec()
    paintGradientFillOnContext(targetCtx, spec, {
      snapshotCanvas: gradientSnapshotCanvas,
      clipToSelection: Layers.hasActiveLassoSelection() ? clipGradientToActiveSelection : undefined,
    })
    syncLayerDisplayDuringStroke(state.gradientMode.layerId)
    renderActiveGradientGuide(spec)
  }

  const redrawGradientGuideIfActive = () => {
    if (!state.gradientMode.hasActiveEdit && !state.gradientMode.isDragging) return
    renderActiveGradientGuide(currentGradientSpec())
  }

  const restoreGradientSnapshotAndClear = () => {
    const layerId = state.gradientMode.layerId
    const targetCtx = (layerId ? Layers.getLayerContext(layerId) : null) || refs.layerContext
    if (targetCtx?.canvas && gradientSnapshotCanvas) {
      const prevGco = targetCtx.globalCompositeOperation
      const prevAlpha = targetCtx.globalAlpha
      targetCtx.globalCompositeOperation = 'source-over'
      targetCtx.globalAlpha = 1
      targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height)
      targetCtx.drawImage(gradientSnapshotCanvas, 0, 0)
      targetCtx.globalCompositeOperation = prevGco
      targetCtx.globalAlpha = prevAlpha
      if (layerId) {
        syncLayerDisplayDuringStroke(layerId)
      }
    }
    state.gradientMode.isDragging = false
    state.gradientMode.draggingHandle = null
    state.gradientMode.hasActiveEdit = false
    state.gradientMode.layerId = ''
    refs.gradientBar?.classList.remove('editor-lasso__bar--drawing')
    clearGradientGuideOverlay(refs.gradientOverlay)
  }

  const finishGradientEdit = () => {
    if (state.gradientMode.isDragging) {
      restoreGradientSnapshotAndClear()
      return
    }
    if (!state.gradientMode.hasActiveEdit || !state.gradientMode.layerId) {
      clearGradientGuideOverlay(refs.gradientOverlay)
      return
    }
    const layerId = state.gradientMode.layerId
    const spec = currentGradientSpec()
    state.gradientMode.hasActiveEdit = false
    state.gradientMode.isDragging = false
    state.gradientMode.draggingHandle = null
    state.gradientMode.layerId = ''
    refs.gradientBar?.classList.remove('editor-lasso__bar--drawing')
    clearGradientGuideOverlay(refs.gradientOverlay)

    flushPendingHistorySave()
    void Layers.addLayerHistoryContentChangedStep(layerId).then(() => {
      if (Layers.hasActiveLassoSelection()) {
        void Layers.refreshActiveLassoSelection()
      }
    })
    if (Coworking.isOpen()) {
      sendCoworkingGradientFill(state, layerId, spec)
    }
  }

  const cancelGradientIfDragging = () => {
    if (state.gradientMode.isDragging) {
      restoreGradientSnapshotAndClear()
    }
  }

  const onGradientTouchStart = (touchEvent: PointerTouchEvent) => {
    Ruler.hide()
    updateCurrentTouchType(state, touchEvent)
    updateCurrentTouchData(state, touchEvent, Params.eventStart)
    const x = state.currentTouch.x
    const y = state.currentTouch.y
    const activeLayerId = Layers.getCurrentSelectedLayerId()
    if (!activeLayerId) return

    if (state.gradientMode.hasActiveEdit && state.gradientMode.layerId === activeLayerId) {
      const hit = hitTestGradientEndpoint(
        x,
        y,
        state.gradientMode.x0,
        state.gradientMode.y0,
        state.gradientMode.x1,
        state.gradientMode.y1,
        getGradientHandleHitRadiusPx(state.canvas.scale)
      )
      if (hit) {
        state.gradientMode.isDragging = true
        state.gradientMode.draggingHandle = hit
        if (hit === 'start') {
          state.gradientMode.x0 = x
          state.gradientMode.y0 = y
        } else {
          state.gradientMode.x1 = x
          state.gradientMode.y1 = y
        }
        refs.gradientBar?.classList.add('editor-lasso__bar--drawing')
        repaintActiveGradientPreview()
        return
      }
    }

    if (state.gradientMode.hasActiveEdit) {
      finishGradientEdit()
    }

    const targetCtx = Layers.getLayerContext(activeLayerId) || refs.layerContext
    if (!targetCtx?.canvas) return
    captureGradientSnapshots(targetCtx.canvas)
    state.gradientMode.layerId = activeLayerId
    state.gradientMode.x0 = x
    state.gradientMode.y0 = y
    state.gradientMode.x1 = x
    state.gradientMode.y1 = y
    state.gradientMode.isDragging = true
    state.gradientMode.draggingHandle = null
    state.gradientMode.hasActiveEdit = false
    refs.gradientBar?.classList.add('editor-lasso__bar--drawing')
  }

  const onGradientTouchMove = (touchEvent: PointerTouchEvent) => {
    if (!state.gradientMode.isDragging) return
    updateCurrentTouchType(state, touchEvent)
    updateCurrentTouchData(state, touchEvent, Params.eventMove)
    if (state.gradientMode.draggingHandle === 'start') {
      state.gradientMode.x0 = state.currentTouch.x
      state.gradientMode.y0 = state.currentTouch.y
    } else {
      state.gradientMode.x1 = state.currentTouch.x
      state.gradientMode.y1 = state.currentTouch.y
    }
    repaintActiveGradientPreview()
  }

  const onGradientTouchEnd = (touchEvent: PointerTouchEvent) => {
    if (!state.gradientMode.isDragging) return
    updateCurrentTouchData(state, touchEvent, Params.eventEnd)
    if (state.gradientMode.draggingHandle === 'start') {
      state.gradientMode.x0 = state.currentTouch.x
      state.gradientMode.y0 = state.currentTouch.y
    } else {
      state.gradientMode.x1 = state.currentTouch.x
      state.gradientMode.y1 = state.currentTouch.y
    }
    refs.gradientBar?.classList.remove('editor-lasso__bar--drawing')
    if (
      !isGradientDragValid(
        state.gradientMode.x0,
        state.gradientMode.y0,
        state.gradientMode.x1,
        state.gradientMode.y1
      )
    ) {
      restoreGradientSnapshotAndClear()
      return
    }
    state.gradientMode.isDragging = false
    state.gradientMode.draggingHandle = null
    state.gradientMode.hasActiveEdit = true
    repaintActiveGradientPreview()
  }

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
    finishGradientEdit()
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

  const capturePreStrokeOutsideForLasso = (
    sourceCanvas: HTMLCanvasElement | undefined,
    maskCanvas: HTMLCanvasElement | undefined
  ) => {
    if (!sourceCanvas || !maskCanvas || !sourceCanvas.width || !sourceCanvas.height) return
    const w = sourceCanvas.width
    const h = sourceCanvas.height
    if (!preStrokeOutsideCanvas) {
      if (typeof OffscreenCanvas !== 'undefined') {
        preStrokeOutsideCanvas = new OffscreenCanvas(w, h)
      } else if (typeof document !== 'undefined') {
        preStrokeOutsideCanvas = document.createElement('canvas')
      }
      if (preStrokeOutsideCanvas) {
        preStrokeOutsideCtx = preStrokeOutsideCanvas.getContext('2d') as
          CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
      }
    }
    if (!preStrokeOutsideCanvas || !preStrokeOutsideCtx) return
    if (preStrokeOutsideCanvas.width !== w || preStrokeOutsideCanvas.height !== h) {
      preStrokeOutsideCanvas.width = w
      preStrokeOutsideCanvas.height = h
    }
    preStrokeOutsideCtx.globalCompositeOperation = 'source-over'
    preStrokeOutsideCtx.globalAlpha = 1
    preStrokeOutsideCtx.clearRect(0, 0, w, h)
    preStrokeOutsideCtx.drawImage(sourceCanvas, 0, 0)
    preStrokeOutsideCtx.globalCompositeOperation = 'destination-out'
    preStrokeOutsideCtx.drawImage(maskCanvas, 0, 0)
    preStrokeOutsideCtx.globalCompositeOperation = 'source-over'
  }

  const applyLassoMaskCompositeToContext = (targetCtx: ExtendedCanvasContext | null) => {
    const lassoSel = Layers.getActiveLassoSelection()
    if (!targetCtx || !lassoSel?.maskCanvas) return
    const prevGco = targetCtx.globalCompositeOperation
    const prevAlpha = targetCtx.globalAlpha
    targetCtx.globalAlpha = 1
    targetCtx.globalCompositeOperation = 'destination-in'
    targetCtx.drawImage(lassoSel.maskCanvas, 0, 0)
    if (
      targetCtx !== refs.contextForLine &&
      preStrokeOutsideCanvas &&
      preStrokeOutsideCanvas.width > 0 &&
      preStrokeOutsideCanvas.height > 0
    ) {
      targetCtx.globalCompositeOperation = 'lighter'
      targetCtx.drawImage(preStrokeOutsideCanvas as CanvasImageSource, 0, 0)
    }
    targetCtx.globalCompositeOperation = prevGco
    targetCtx.globalAlpha = prevAlpha
  }

  const beginLassoCanvasClip = () => {
    const lassoSel = Layers.getActiveLassoSelection()
    if (!lassoSel || lassoClipActive) return
    if (state.currentToolProps.name === 'bucket') {
      if (refs.layerContext?.canvas) {
        capturePreStrokeOutsideForLasso(refs.layerContext.canvas, lassoSel.maskCanvas)
      }
      return
    }
    if (refs.layerContext) {
      refs.layerContext.save()
      applyLassoClipPath(refs.layerContext, lassoSel.points, lassoSel.inverted, lassoSel.rings)
    }
    if (refs.contextForLine) {
      refs.contextForLine.save()
      applyLassoClipPath(refs.contextForLine, lassoSel.points, lassoSel.inverted, lassoSel.rings)
    }
    lassoClipActive = true
  }

  const endLassoCanvasClip = () => {
    if (!lassoClipActive) return
    lassoClipActive = false
    refs.layerContext?.restore()
    refs.contextForLine?.restore()
  }

  const commitHistoryAndRefreshLasso = () => {
    void Layers.addLayerHistoryContentChangedStep().then(() => {
      if (Layers.hasActiveLassoSelection()) {
        void Layers.refreshActiveLassoSelection()
      }
    })
  }

  const saveStepHistory = () => {
    if (pendingHistoryRafId !== null) {
      cancelAnimationFrame(pendingHistoryRafId)
      pendingHistoryRafId = null
    }
    commitHistoryAndRefreshLasso()
  }

  const flushPendingHistorySave = () => {
    if (pendingHistoryRafId === null) return
    cancelAnimationFrame(pendingHistoryRafId)
    pendingHistoryRafId = null
    commitHistoryAndRefreshLasso()
  }

  const scheduleSaveStepHistory = () => {
    if (pendingHistoryRafId !== null) {
      cancelAnimationFrame(pendingHistoryRafId)
    }
    pendingHistoryRafId = requestAnimationFrame(() => {
      pendingHistoryRafId = null
      commitHistoryAndRefreshLasso()
    })
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
      pendingCursorSize = isSmudgeTool() ? getSmudgeCursorSize(size, state.currentTouch.type) : size
      pendingCursorX = x
      pendingCursorY = y
      if (!cursorRafId) {
        cursorRafId = requestAnimationFrame(() => {
          cursorRafId = 0
          if (state.currentToolProps.cursor && refs.toolCursor && state.currentTouch.isDown) {
            const smudgeSuffix = getSmudgeCursorClassSuffix(state.currentTouch.type)
            refs.toolCursor.classList.toggle(
              'editor__tool-cursor--smudge-finger',
              isSmudgeTool() && smudgeSuffix === 'finger'
            )
            refs.toolCursor.classList.toggle(
              'editor__tool-cursor--smudge-pen',
              isSmudgeTool() && smudgeSuffix === 'pen'
            )
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

  const drawEffectPhase = (
    context: ExtendedCanvasContext,
    stepData: StrokeSample,
    phase: 'start' | 'move' | 'end',
    budgetMs?: number
  ) =>
    effectBrushStrokeStep(
      context,
      effectSession,
      { ...stepData, type: phase },
      phase,
      state.currentToolProps.name as EffectBrushKind,
      getEffectBaseIntensity(),
      budgetMs
    )

  const drawSmudgePhase = (
    context: ExtendedCanvasContext,
    stepData: StrokeSample,
    phase: 'start' | 'move' | 'end'
  ) =>
    smudgeStrokeStep(
      context,
      smudgeSession,
      { ...stepData, type: phase },
      phase,
      smudgeTouchTypeToInputKind(state.currentTouch.type)
    )

  const performBucketFill = async (
    x: number,
    y: number,
    color: string,
    options?: BucketFillOptions,
    sendForCoworking = true
  ): Promise<boolean> => {
    if (!coordsAreInsideLayer(x, y)) return false
    const layerId = Layers.getCurrentSelectedLayerId()
    const context = layerId ? Layers.getLayerContext(layerId) : refs.layerContext
    if (!layerId || !context?.canvas) return false

    flushPendingHistorySave()
    const lassoSel = Layers.getActiveLassoSelection()
    if (lassoSel && context.canvas) {
      capturePreStrokeOutsideForLasso(context.canvas, lassoSel.maskCanvas)
    }

    let hasBeenUsed = false
    if (Layers.isYourLayerEmpty(layerId)) {
      fillCompletely(context, color, context.canvas.width, context.canvas.height)
      if (lassoSel) {
        applyLassoMaskCompositeToContext(context)
      }
      hasBeenUsed = true
      syncLayerDisplayDuringStroke(layerId)
      saveStepHistory()
    } else {
      const res = fillActiveLayerWithBucketAt(layerId, x, y, color, options)
      if (res) {
        hasBeenUsed = true
        await res
        if (Layers.hasActiveLassoSelection()) {
          applyLassoMaskCompositeToContext(context)
        }
        syncLayerDisplayDuringStroke(layerId)
        saveStepHistory()
      }
    }

    if (hasBeenUsed && Coworking.isOpen() && sendForCoworking) {
      sendCoworkingStep(state, { type: 'start', x, y }, true)
    }
    return hasBeenUsed
  }

  const useBucket = async (
    context: ExtendedCanvasContext,
    x: number,
    y: number,
    color: string,
    sendForCoworking = true
  ) => {
    void context
    await performBucketFill(x, y, color, undefined, sendForCoworking)
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

    const lassoSel = Layers.getActiveLassoSelection()
    const needsPostClip = Boolean(lassoSel && !lassoClipActive)
    if (needsPostClip && lassoSel) {
      targetCtx.save()
      applyLassoClipPath(targetCtx, lassoSel.points, lassoSel.inverted, lassoSel.rings)
    }

    if (variant === 'freehand') {
      for (const step of quickShapeFreehandSteps) {
        drawStrokeWithGuides(targetCtx, step, quickShapeToolSnapshot, true)
      }
      targetCtx.globalAlpha = 1
      targetCtx.globalCompositeOperation = 'source-over'
      if (needsPostClip) {
        targetCtx.restore()
      }
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
      drawStrokeWithGuides(targetCtx, step, quickShapeToolSnapshot, true)
    }
    targetCtx.globalAlpha = 1
    targetCtx.globalCompositeOperation = 'source-over'
    if (needsPostClip) {
      targetCtx.restore()
    }
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
      !isSmudgeTool() &&
      !isEffectTool() &&
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
      const thisStepHasDoneSomething = isSmudgeTool()
        ? drawSmudgePhase(context, stepData, 'start')
        : isEffectTool()
          ? drawEffectPhase(context, stepData, 'start')
          : drawStepStart(context, stepData, state.currentToolProps)
      state.currentTouch.drewSomething =
        state.currentTouch.drewSomething ||
        (thisStepHasDoneSomething && coordsAreInsideLayer(stepData.x, stepData.y))
      if (Coworking.isOpen() && (thisStepHasDoneSomething || isSmudgeTool() || isEffectTool())) {
        sendCoworkingStep(state, { ...stepData, type: 'start' })
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

    const thisStepHasDoneSomething = isSmudgeTool()
      ? drawSmudgePhase(context, stepData, 'move')
      : isEffectTool()
        ? drawEffectPhase(context, stepData, 'move')
        : drawStepMove(context, stepData, state.currentToolProps)
    state.currentTouch.drewSomething =
      state.currentTouch.drewSomething ||
      (thisStepHasDoneSomething && coordsAreInsideLayer(stepData.x, stepData.y))
    if (sendDataForCoworking && thisStepHasDoneSomething && Coworking.isOpen()) {
      sendCoworkingStep(
        state,
        { ...stepData, type: 'move' },
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

    if (
      hasMovedFromLastStep ||
      hasUnfinishedMidSegment ||
      (isEffectTool() && hasPendingEffectDab(effectSession))
    ) {
      const fullStep = getStepData(state.currentToolProps, state.currentTouch, state.lastStep)
      stepData = fullStep
      const thisStepHasDoneSomething = isSmudgeTool()
        ? drawSmudgePhase(context, fullStep, 'end')
        : isEffectTool()
          ? drawEffectPhase(context, fullStep, 'end', Infinity)
          : drawStepEnd(context, fullStep, state.currentToolProps)
      state.currentTouch.drewSomething =
        state.currentTouch.drewSomething ||
        (thisStepHasDoneSomething && coordsAreInsideLayer(fullStep.x, fullStep.y))
    }

    if (isEffectTool()) {
      resetEffectBrushStrokeSession(effectSession)
    }

    if (isSmudgeTool()) {
      resetSmudgeStrokeSession(smudgeSession)
      refs.toolCursor?.classList.remove(
        'editor__tool-cursor--smudge-finger',
        'editor__tool-cursor--smudge-pen'
      )
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
      scheduleSaveStepHistory()
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
    endLassoCanvasClip()
    if (state.lassoMode?.hasSelection) {
      refs.lassoBar?.classList.add('editor-lasso__bar--drawing')
    }
    state.currentTouch = { ...initialCurrentTouch }
    state.lastStep = {}
    state.lastAdaptedStep = {}
    state.hasPredictedOverlay = false
    updateCurrentTouchType(state, touchEvent)

    state.lastLineAdaptationTimestamp = Date.now()
    state.stepsSinceLastLineAdaptation = 0

    updateCurrentTouchData(state, touchEvent, Params.eventStart)
    if (Layers.hasPendingLassoFloat()) {
      Layers.commitPendingLassoFloat(true)
    }
    if (state.currentTouch.isNearRuler && !Ruler.isHeldByFingers()) {
      Ruler.lock()
      nearRulerLocked = true
    } else if (
      (!state.currentTouch.isNearRuler && isQuickShapeSupportedTool(state.currentToolProps)) ||
      Layers.hasActiveLassoSelection()
    ) {
      capturePreStrokeSnapshot(refs.layerContext.canvas)
    }
    if (Layers.hasActiveLassoSelection()) {
      beginLassoCanvasClip()
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
    refs.lassoBar?.classList.remove('editor-lasso__bar--drawing')
    if (!refs.contextForLine || !refs.canvasForLine || !refs.layerContext) {
      endLassoCanvasClip()
      return
    }
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
      endLassoCanvasClip()

      if (Coworking.isOpen() && quickShapeCurrentSteps.length > 0) {
        sendCoworkingQuickShapeSteps(state, quickShapeCurrentSteps, 'current')
      }
      const layerId = Layers.getCurrentSelectedLayerId()
      if (layerId) refreshStrokeLayerDisplay(layerId)
      scheduleSaveStepHistory()
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
    endLassoCanvasClip()
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
      endLassoCanvasClip()
      state.currentTouch = { ...initialCurrentTouch }
      state.lastStep = {}
      state.lastAdaptedStep = {}
      updateCurrentTouchType(state, touchEvent)
      state.currentTouch.isNearRuler = true
      updateCurrentTouchData(state, touchEvent, Params.eventStart, x, y)
      if (Layers.hasActiveLassoSelection()) {
        capturePreStrokeSnapshot(refs.layerContext.canvas)
        beginLassoCanvasClip()
      }
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
    endLassoCanvasClip()
  }

  const onTextTouchStart = (touchEvent: PointerTouchEvent) => {
    Ruler.hide()
    updateCurrentTouchType(state, touchEvent)
    updateCurrentTouchData(state, touchEvent, Params.eventStart)
    void startOrManipulateTextAtPoint(state, refs, state.currentTouch.x, state.currentTouch.y)
  }

  const onTextTouchMove = (touchEvent: PointerTouchEvent) => {
    if (!state.textMode.isDraggingBox) return
    updateCurrentTouchType(state, touchEvent)
    updateCurrentTouchData(state, touchEvent, Params.eventMove)
    moveTextBoxHandleDrag(state, refs, state.currentTouch.x, state.currentTouch.y)
  }

  const onTextTouchEnd = (touchEvent: PointerTouchEvent) => {
    if (!state.textMode.isDraggingBox) return
    updateCurrentTouchData(state, touchEvent, Params.eventEnd)
    moveTextBoxHandleDrag(state, refs, state.currentTouch.x, state.currentTouch.y)
    endTextBoxHandleDrag(state, refs)
  }

  return {
    onStepTouchStart,
    onStepTouchMove,
    onStepTouchEnd,
    onGradientTouchStart,
    onGradientTouchMove,
    onGradientTouchEnd,
    onTextTouchStart,
    onTextTouchMove,
    onTextTouchEnd,
    repaintActiveGradientPreview,
    redrawGradientGuideIfActive,
    finishGradientEdit,
    cancelGradientIfDragging,
    makeTouchStartNearRuler,
    makeTouchMoveNearRuler,
    makeTouchEndNearRuler,
    applyQuickShapeVariant,
    dismissQuickShape,
    performBucketFill,
  }
}
