import editorTemplate from './editor.tpl?raw'
import './editor.css'

import Params from 'main/Params'
import * as Coworking from 'modules/Coworking'
import * as Debug from 'modules/Debug'
import * as Messages from 'modules/Messages'
import * as Header from 'components/Header'
import * as ColorPicker from './components/ColorPicker'
import * as Toolbar from './components/Toolbar'
import * as Layers from './components/Layers'
import * as Tools from './components/Tools'
import * as Ruler from './components/Ruler'
import * as Folder from 'pages/Folder'
import { addPreventPageRefresh, removePreventPageRefresh } from 'main/main'
import {
  setSpinner,
  getEventCoordX,
  getEventCoordY,
  loadTemplate,
  preventDefault,
  getDomRect,
} from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import {
  addGlobalStatus,
  removeGlobalStatus,
  toggleGlobalStatus,
  addRotationHandler,
  removeRotationHandler,
  cleanRefs,
} from 'utils/moduleUtils'
import {
  round,
  getNumberInBetween,
  getOriginalCoordsFromScaleRotation,
  getAverage,
  roundAngleForSteps,
  getAltitudeFactorFromAngle,
} from 'utils/mathUtils'
import { rgbToHex } from 'utils/colorsUtils'
import {
  saveDrawingToDB,
  getOneDrawing,
  saveDrawingPaletteColors,
  setBackgroundSavingId,
} from 'utils/localDbUtils'
import { handlePointerEvents } from 'utils/pointerEventsUtils'
import { noop } from 'utils/jsUtils'
import { addResizeBulletsHandlers } from 'utils/uiUtils'
import {
  init as initCanvasUtils,
  remove as removeCanvasUtils,
  fillWithBucket,
  setImageShapeIfNeeded,
  cleanBucketHistory,
  getCanvasColorAtPx,
  fillCompletely,
  getNewContextForCanvas,
  drawStrokeSample,
  ExtendedCanvasContext,
  StrokeSample,
} from 'utils/canvasUtils'
import {
  initEditorUtils,
  cleanEditorUtils,
  drawMultipleCoworkingSteps,
  updateCurrentTouchData,
  getStepData,
  updateEditorZoomGlobalState,
  shouldThisStepMoveAdaptLine,
  initState,
  initCanvasOffset,
  findValueWithMagnetism,
  applyRationResizeMagnetism,
  updateLastStepData,
} from './editorUtils'
import { toolDefaultProps } from './config'
import { openPageFolder } from 'modules/Router'
import { TOUCH_TYPE_STYLUS, TOUCH_TYPE_FINGER } from 'main/constants'
import { spacing } from 'main/Theme'

export const config = {
  draftTimeInterval: 30_000,
  draftStepsInterval: 50,
  stepsRequiredToMakeACopy: 10,
  maxSpeedFactorLength: 150,
  defaultForceTouch: 0.1,
  defaultAltitudeAngle: Math.PI / 3,
  initialForceTouchBugValue: 0.07999999999999999,
  maxSupportedStylusAltitudeFactor: 0.844,
  defaultToolParams: { ...toolDefaultProps },
  maxScale: 5.0,
  minScale: 0.3,
  maxCanvasSize: 4096,
  canvasScaleWithGoodPerformance: 1,
  minAltitudeFactorToHandleRotation: 0.3,
  resizeRotationStep: 2.5,
  resizeRotationInterval: 45,
  draftInfoDuration: 3_000,
}

let state: Record<string, any> = {}
let lastActiveDrawingId: number | false = false

export const getLastActiveDrawingId = (): number | false =>
  state?.localDbDrawId || lastActiveDrawingId
const initialState = {
  pageOpened: false,
  modifiedSinceLastSave: false,
  modifiedSinceLastCopy: false,
  currentTouch: {
    type: '',
    touchType: '',
    x: 0,
    y: 0,
    midX: 0,
    midY: 0,
    eventX: 0,
    eventY: 0,
    startDragX: 0,
    startDragY: 0,
    dragX: 0,
    dragY: 0,
    force: 0,
    drewSomething: false,
    isNearRuler: false,
    isDown: false,
    isZooming: false,
    zoomDragChanged: false,
    altitudeAngle: config.defaultAltitudeAngle,
    altitudeFactor: getAltitudeFactorFromAngle(
      config.defaultAltitudeAngle,
      config.maxSupportedStylusAltitudeFactor
    ),
    azimuthAngle: 0,
    rotation: 0,
    pathRotation: 0,
    stepLength: 0,
    speedFactor: 0,
    canHandleStylusRotation: true,
  },
  lastStep: {
    x: -1,
    y: -1,
    midX: -1,
    midY: -1,
    alpha: 0,
    size: 0,
    rotation: 0,
  },
  lastAdaptedStep: {},
  lastLineAdaptationTimestamp: 0,
  stepsSinceLastLineAdaptation: 0,
  pxDistanceSinceLastLineAdaptation: 0,
  fullscreenActive: false,
  canvas: {
    width: 0,
    height: 0,
    scale: 1,
    initialScale: 1,
    rotation: 0,
    dragStartX: 0,
    dragStartY: 0,
    translateX: 0,
    translateY: 0,
    transformOriginX: 0,
    transformOriginY: 0,
    originCoordX: 0,
    originCoordY: 0,
    centerCoordX: 0,
    centerCoordY: 0,
    offset: {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    },
  },
  resizeMode: {
    active: false,
    useMagnetism: true,
    isResizing: false,
    x: -1,
    y: -1,
    w: -1,
    h: -1,
    r: 0,
    startDragX: -1,
    startDragY: -1,
  },
  pipette: {
    bg: 'none',
    isVisible: false,
    currentColor: false,
    isOnCanvas: false,
    context: null,
  },
  currentLayerGCO: 'source-over',
  currentToolGCO: 'source-over',
  currentLayerIsActive: true,
  currentDeviceHasStylus: false,
  drawnStepsSinceDraft: 0,
  draftInterval: false,
  currentSavingDraw: false,
  stepsSinceLastCoworkingUpdate: 0,
  localDbDrawId: false,
  isSavingToGoToFolder: false,
  currentToolProps: {
    ...config.defaultToolParams,
    color: '',
    randomColor: true,
  },
}

const refs: {
  container: HTMLElement | null
  canvasContainer: HTMLElement | null
  canvasForLine: HTMLCanvasElement | null
  canvasOrigin: HTMLElement | null
  canvasCenter: HTMLElement | null
  layerContext: ExtendedCanvasContext | null
  contextForLine: ExtendedCanvasContext | null
  toolCursor: HTMLElement | null
  touchLayer: HTMLElement | null
  pipetteCursor: HTMLElement | null
  pipetteBackground: HTMLElement | null
  dragBox: HTMLElement | null
  magnetisedLineX: HTMLElement | null
  magnetisedLineY: HTMLElement | null
  magnetisedLineR: HTMLElement | null
  dragBulletOriginTL: HTMLElement | null
  dragBulletOriginTR: HTMLElement | null
  dragBulletOriginBL: HTMLElement | null
  dragBulletOriginBR: HTMLElement | null
  dragBulletOriginRT: HTMLElement | null
  dragBulletTL: HTMLElement | null
  dragBulletT: HTMLElement | null
  dragBulletTR: HTMLElement | null
  dragBulletL: HTMLElement | null
  dragBulletR: HTMLElement | null
  dragBulletBL: HTMLElement | null
  dragBulletB: HTMLElement | null
  dragBulletBR: HTMLElement | null
  dragBulletRT: HTMLElement | null
} = {
  container: null,
  canvasContainer: null,
  canvasForLine: null,
  canvasOrigin: null,
  canvasCenter: null,
  layerContext: null,
  contextForLine: null,
  toolCursor: null,
  touchLayer: null,
  pipetteCursor: null,
  pipetteBackground: null,
  dragBox: null,
  magnetisedLineX: null,
  magnetisedLineY: null,
  magnetisedLineR: null,
  dragBulletOriginTL: null,
  dragBulletOriginTR: null,
  dragBulletOriginBL: null,
  dragBulletOriginBR: null,
  dragBulletOriginRT: null,
  dragBulletTL: null,
  dragBulletT: null,
  dragBulletTR: null,
  dragBulletL: null,
  dragBulletR: null,
  dragBulletBL: null,
  dragBulletB: null,
  dragBulletBR: null,
  dragBulletRT: null,
}

const labels = {
  draftSaved: 'Draft saved',
  draftError: 'An error occurred during draft saving',
  copySaved: 'New copy saved',
  copyError: 'An error occurred during saving',
  savingError: 'An error occurred during saving',
  areYouSureToCloseCoworking: 'Are you sure to close the drawing session?',
  youHaveDifferentScreenSizes: 'You and your friend have different screen sizes',
}

export let coworking: ((coworkerSocketId: string) => void) | undefined

const stepDataKeys: Array<keyof StrokeSample> = [
  'type',
  'x',
  'y',
  'midX',
  'midY',
  'size',
  'alpha',
  'rotation',
  'oldSize',
  'oldAlpha',
  'oldRotation',
  'oldMidX',
  'oldMidY',
  'oldX',
  'oldY',
  'stepLength',
]
const addTouchStepDataKeys = (stepDataArray: any[]): StrokeSample => ({
  type: stepDataArray[0],
  x: stepDataArray[1],
  y: stepDataArray[2],
  midX: stepDataArray[3],
  midY: stepDataArray[4],
  size: stepDataArray[5],
  alpha: stepDataArray[6],
  rotation: stepDataArray[7],
  oldSize: stepDataArray[8],
  oldAlpha: stepDataArray[9],
  oldRotation: stepDataArray[10],
  oldMidX: stepDataArray[11],
  oldMidY: stepDataArray[12],
  oldX: stepDataArray[13],
  oldY: stepDataArray[14],
  stepLength: stepDataArray[15],
})
const removeTouchStepDataKeys = (stepData: Record<string, any>) =>
  stepDataKeys.map((key) => {
    const e = stepData[key]
    return typeof e === 'number' ? round(e, 4) : e
  })

const globalCompositeOperationValues: GlobalCompositeOperation[] = [
  'source-over',
  'destination-out',
  'source-atop',
]
const addToolDataKeys = (toolDataArray: any[]) => ({
  name: toolDataArray[0],
  version: toolDataArray[1],
  color: toolDataArray[2],
  globalCompositeOperation: globalCompositeOperationValues[toolDataArray[3]],
  frameImageName: toolDataArray[4],
  customProps: toolDataArray[5],
})
const removeToolDataKeys = (toolData: any) => [
  toolData.name,
  toolData.version,
  toolData.color,
  globalCompositeOperationValues.indexOf(toolData.globalCompositeOperation),
  toolData.frameImageName,
  toolData.customProps,
]

export const drawCoworkingMultipleStepsData = (data: any) => {
  if (state?.pageOpened) {
    drawMultipleCoworkingSteps(
      data.layerId,
      data.steps.map(addTouchStepDataKeys),
      addToolDataKeys(data.tool),
      {
        start: drawStepStart,
        move: drawStepMove,
        end: drawStepEnd,
        bucket: receiveBucketFromCoworker,
      }
    )
    if (data.steps.find((step: any[]) => step[0] === 'end')) {
      requestAnimationFrame(() => Layers.addLayerHistoryContentChangedStep(data.layerId))
    }
  }
}

const getResizeState = () => ({ ...state.resizeMode })
const saveStepHistory = () => {
  Layers.addLayerHistoryContentChangedStep()
}

export const setDrawingModified = () => {
  state.modifiedSinceLastSave = true
  state.drawnStepsSinceDraft += 1
  if (state.drawnStepsSinceDraft >= config.draftStepsInterval) {
    saveDraft()
  }
  if (!state.modifiedSinceLastCopy) {
    state.modifiedSinceLastCopy = true
    Toolbar.enableSaveCopy()
  }
}

export const clear = () => {
  Layers.clearCurrentLayer()
}

const receiveBucketFromCoworker = async (layerId: string, x: number, y: number, color: string) => {
  const context = Layers.getLayerContext(layerId)
  if (Layers.isYourLayerEmpty(layerId)) {
    fillCompletely(context, color, context.canvas.width, context.canvas.height)
  } else {
    await fillWithBucket(context, x, y, color, context.canvas.width, context.canvas.height)
  }
  await Layers.addLayerHistoryContentChangedStep(layerId)
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
      const res = fillWithBucket(context, x, y, color, context.canvas.width, context.canvas.height)
      if (res) {
        hasBeenUsed = true
        res.then(saveStepHistory)
      }
    }
    if (hasBeenUsed && Coworking.isOpen() && sendForCoworking) {
      sendCoworkingStep({ type: 'start', x, y } as any, true)
    }
  }
}

const coordsAreInsideLayer = (x: number, y: number) =>
  x > 0 && y > 0 && x <= state.canvas.width && y <= state.canvas.height

const updatePipette = (canvasX: number, canvasY: number, domX: string, domY: string) => {
  if (!refs.pipetteCursor || !refs.pipetteBackground) return
  refs.pipetteCursor.style.left = `${domX}`
  refs.pipetteCursor.style.top = `${domY}`

  if (coordsAreInsideLayer(canvasX, canvasY)) {
    if (state.pipette.isOnCanvas === false) {
      refs.pipetteBackground.style.backgroundImage = `url(${state.pipette.bg})`
    }
    state.pipette.isOnCanvas = true
    const bgX = canvasX * 2 * state.canvas.scale
    const bgY = canvasY * 2 * state.canvas.scale
    refs.pipetteBackground.style.backgroundPosition = `calc(-${bgX}px + (14rem * 0.4)) calc(-${bgY}px + (14rem * 0.4))`
    refs.pipetteBackground.style.backgroundSize = `${state.canvas.width * 2 * state.canvas.scale}px ${state.canvas.height * 2 * state.canvas.scale}px`
    refs.pipetteBackground.style.transform = `translate3d(-50%, -50%, 0px) rotate3d(0, 0, 1, ${state.canvas.rotation}deg)`
    const color = getCanvasColorAtPx(
      state.pipette.context,
      canvasX,
      canvasY,
      state.canvas.width,
      state.canvas.height
    )
    if (color.a || color.r || color.g || color.b) {
      const hexColor = rgbToHex(color.r, color.g, color.b, round(color.a / 255, 4))
      state.pipette.currentColor = hexColor
      refs.pipetteCursor.style.backgroundColor = hexColor
    } else {
      state.pipette.currentColor = false
      refs.pipetteCursor.style.backgroundColor = 'var(--palette-white)'
    }
  } else {
    state.pipette.isOnCanvas = false
    refs.pipetteBackground.style.backgroundImage = 'none'
    state.pipette.currentColor = false
    refs.pipetteCursor.style.backgroundColor = 'var(--palette-white)'
  }
}

const initPipetteCursor = async () => {
  if (!refs.pipetteCursor || !refs.pipetteBackground) return
  state.pipette.isOnCanvas = true
  state.pipette.bg = 'none'
  state.pipette.currentColor = false
  refs.pipetteCursor.style.backgroundColor = 'var(--palette-white)'
  refs.pipetteBackground.style.backgroundImage = 'none'
  state.pipette.context = null

  refs.pipetteCursor.style.left = `calc(${(state.canvas.width / 2 / Params.pxScale) * state.canvas.initialScale + state.canvas.offset.left}px)`
  refs.pipetteCursor.style.top = `calc(${(state.canvas.height / 2 / Params.pxScale) * state.canvas.initialScale + state.canvas.offset.top}px)`

  fadeInElements(refs.pipetteCursor)
  state.pipette.isVisible = true
  let initialX = (state.canvas.width / 2) * state.canvas.initialScale
  let initialY = (state.canvas.height / 2) * state.canvas.initialScale

  if (currentCanvasHasZoom()) {
    ;[initialX, initialY] = getOriginalCoordsFromScaleRotation(
      initialX,
      initialY,
      state.canvas.originCoordX,
      state.canvas.originCoordY,
      state.canvas.scale,
      state.canvas.rotation
    )
  }

  Layers.exportWholeCanvasData(true).then((currentImageData: any) => {
    if (!refs.pipetteBackground) return
    state.pipette.bg = currentImageData.base64
    refs.pipetteBackground.style.backgroundImage = `url(${currentImageData.base64})`
    state.pipette.context = currentImageData.context

    updatePipette(
      initialX,
      initialY,
      `calc(${(state.canvas.width / 2 / Params.pxScale) * state.canvas.initialScale + state.canvas.offset.left}px)`,
      `calc(${(state.canvas.height / 2 / Params.pxScale) * state.canvas.initialScale + state.canvas.offset.top}px)`
    )
  })
}

export const hidePipetteCursor = async () => {
  state.pipette.currentColor = false
  if (refs.pipetteCursor) {
    await fadeOutElements(refs.pipetteCursor)
  }
  state.pipette.isVisible = false
  state.pipette.bg = 'none'
  if (state.pipette.context?.canvas) {
    state.pipette.context.canvas.width = state.pipette.context.canvas.height = 0
  }
  state.pipette.context = null
}

const closePipetteCursor = async () => {
  if (state.pipette.currentColor) {
    ColorPicker.addPaletteColor(state.pipette.currentColor, false)
    ColorPicker.confirmLastAddedColorIfNeeded()
  }
  ColorPicker.deselectPipette(true, true, !state.pipette.currentColor)
}

const getCurrentDrawingInfo = async () => {
  const currentDrawing: Record<string, any> = await Layers.exportWholeCanvasData()
  currentDrawing.localDbId = state.localDbDrawId
  currentDrawing.colors = ColorPicker.getCurrentColorsPalette()
  currentDrawing.selectedColorId = ColorPicker.getCurrentSelectedColorId()
  currentDrawing.toolsCustomProps = Tools.getToolsCustomProps()
  currentDrawing.selectedTool = Tools.getCurrentSelectedTool()
  return currentDrawing
}

export const saveAndGoToFolder = async () => {
  if (!Coworking.isOpen() || (await Messages.confirm(labels.areYouSureToCloseCoworking))) {
    const madeByCorowking = Coworking.isOpen()
    setSpinner(true)
    setDraftInterval(false)
    Coworking.stop()
    if (state.modifiedSinceLastSave) {
      const currentDrawing = await getCurrentDrawingInfo()
      if (currentDrawing.maxX >= 0) {
        currentDrawing.layers = []
        currentDrawing.madeByCorowking = madeByCorowking
        const savedId = await saveDrawingToDB(currentDrawing)
        currentDrawing.localDbId = savedId
        state.localDbDrawId = savedId
        lastActiveDrawingId = savedId
        setBackgroundSavingId(savedId, true)
        addPreventPageRefresh()
        state.isSavingToGoToFolder = true
        Layers.exportLayers({
          cleanMemoryAfterwards: true,
        }).then(async (layers) => {
          currentDrawing.layers = layers
          await saveDrawingToDB(currentDrawing)
          setBackgroundSavingId(savedId, false)
          state.modifiedSinceLastSave = true
          removePreventPageRefresh()
          await Folder.updateDrawingsLoading()
        })
      }
    }
    openPageFolder()
  }
}

const save = async ({
  onSave = noop,
  onError = noop,
  asDraft = false,
  asCopy = false,
}: {
  onSave?: (id: any) => void
  onError?: () => void
  asDraft?: boolean
  asCopy?: boolean
} = {}) => {
  if (state.modifiedSinceLastSave) {
    const currentDrawing = await getCurrentDrawingInfo()
    if (currentDrawing.maxX >= 0) {
      if (asCopy) {
        delete currentDrawing.localDbId
      }
      currentDrawing.madeByCorowking = Coworking.isOpen()
      currentDrawing.layers = await Layers.exportLayers()
      const savedId = await saveDrawingToDB(currentDrawing, asDraft)
      if (savedId) {
        onSave(savedId)
      } else {
        onError()
      }
    }
  }
}

const saveDraft = () => {
  if (!state.currentTouch.isDown && state.modifiedSinceLastSave) {
    setDraftInterval(true)
    save({
      onSave: onSaveDraft,
      onError: onSaveDraftError,
      asDraft: true,
    })
  }
}

const onSaveDraft = (draftId: number) => {
  state.drawnStepsSinceDraft = 0
  state.modifiedSinceLastSave = false
  lastActiveDrawingId = draftId
  if (state.localDbDrawId === false) {
    Messages.info(labels.draftSaved, config.draftInfoDuration)
    state.localDbDrawId = draftId
  }
}

const onSaveDraftError = () => {
  state.localDbDrawId = false
  Messages.error(labels.draftError)
}

export const saveCopy = () =>
  save({
    onSave: onSaveCopy,
    onError: onSaveCopyError,
    asCopy: true,
  })

const onSaveCopy = () => {
  state.modifiedSinceLastCopy = false
  Messages.info(labels.copySaved, config.draftInfoDuration)
  Toolbar.disableSaveCopy()
}

const onSaveCopyError = () => {
  Messages.error(labels.draftError)
  Toolbar.enableSaveCopy()
}

export const saveDrawingsPalette = (colors: any[] = []) => {
  if (state.localDbDrawId && colors.length) {
    saveDrawingPaletteColors(state.localDbDrawId, colors)
  }
}

const setDraftInterval = (start: boolean) => {
  clearInterval(state.draftInterval)
  state.draftInterval = false

  if (start) {
    state.draftInterval = setInterval(saveDraft, config.draftTimeInterval)
  }
}

export const changePaper = (paper: string) => {
  if (!refs.canvasContainer) return
  const existingPaper = [...refs.canvasContainer.classList].find((e) => e.indexOf('paper') >= 0)
  if (existingPaper) {
    refs.canvasContainer.classList.remove(existingPaper)
  }
  refs.canvasContainer.classList.add(`paper-${paper}`)
}

export const appendLayer = (layerCanvas: HTMLCanvasElement) => {
  layerCanvas.classList.add('editor__layer-canvas')
  refs.canvasContainer?.appendChild(layerCanvas)
}

export const setLayerContext = (layerContext: ExtendedCanvasContext) => {
  refs.layerContext = layerContext
  if (state.currentToolProps?.frameImageFile) {
    setImageShapeIfNeeded(
      refs.layerContext,
      state.currentToolProps.frameImageFile,
      state.currentToolProps.frameImageName,
      state.currentToolProps.color
    )
    if (refs.contextForLine) {
      setImageShapeIfNeeded(
        refs.contextForLine,
        state.currentToolProps.frameImageFile,
        state.currentToolProps.frameImageName,
        state.currentToolProps.color
      )
    }
  }
}

export const updateEditorLayer = (
  layerZIndex: number,
  opacity: number,
  globalCompositeOperation: GlobalCompositeOperation,
  active: boolean
) => {
  if (!refs.canvasForLine) return
  refs.canvasForLine.style.zIndex = String(layerZIndex + 1)
  refs.canvasForLine.style.opacity = String(opacity)
  state.currentLayerGCO = globalCompositeOperation
  state.currentToolProps.globalCompositeOperation = state.currentToolGCO || globalCompositeOperation
  state.currentLayerIsActive = active
  refs.canvasForLine.classList.toggle('displayNone', !active)
}

export const showDragBox = (x: number, y: number, w: number, h: number, useMagnetism: boolean) => {
  state.resizeMode.active = true
  state.resizeMode.useMagnetism = useMagnetism
  fadeInElements(
    [
      refs.dragBox,
      refs.dragBulletTL,
      refs.dragBulletTR,
      refs.dragBulletBL,
      refs.dragBulletBR,
      refs.dragBulletT,
      refs.dragBulletL,
      refs.dragBulletR,
      refs.dragBulletB,
      refs.dragBulletRT,
    ].filter(Boolean) as HTMLElement[]
  )
  updateDragBox(false, x, y, w, h)
}

const updateLayerContentCoordsAfterDragResize = () => {
  flushPendingResizeFrame()
  const rad = ((state.resizeMode.r || 0) * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const boundW = state.resizeMode.w * cos + state.resizeMode.h * sin
  const boundH = state.resizeMode.w * sin + state.resizeMode.h * cos
  Layers.setLayerCoordsAfterDragResize(
    Math.max(0, round(state.resizeMode.x - boundW / 2)),
    Math.max(0, round(state.resizeMode.y - boundH / 2)),
    Math.min(state.canvas.width, round(state.resizeMode.x + boundW / 2)),
    Math.min(state.canvas.height, round(state.resizeMode.y + boundH / 2))
  )
}

let resizeRafId: number | null = null
let pendingResizeFrame: {
  madeChanges: boolean
  x: number
  y: number
  w: number
  h: number
  r: number
} | null = null

const cancelPendingResizeRaf = () => {
  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId)
    resizeRafId = null
  }
  pendingResizeFrame = null
}

export const flushPendingResizeFrame = () => {
  if (pendingResizeFrame) {
    const frame = pendingResizeFrame
    cancelPendingResizeRaf()
    commitDragBoxFrame(frame.madeChanges, frame.x, frame.y, frame.w, frame.h, frame.r)
  } else {
    cancelPendingResizeRaf()
  }
}

const commitDragBoxFrame = (
  madeChanges: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  if (!refs.dragBox || !state.resizeMode?.active) return
  refs.dragBox.style.cssText = `
    left: ${round(x / Params.pxScale, 1)}px;
    top: ${round(y / Params.pxScale, 1)}px;
    width: ${round(w / Params.pxScale, 1)}px;
    height: ${round(h / Params.pxScale, 1)}px;
    transform: translate3d(-50%, -50%, 0px) rotate3d(0, 0, 1, ${r}deg);
  `
  updateDragBoxHandlersPosition()
  Layers.updateCanvasContent(madeChanges, x, y, w, h, r)
}

const updateDragBox = (madeChanges: boolean, x: number, y: number, w: number, h: number, r = 0) => {
  if (!refs.dragBox) return
  state.resizeMode = {
    ...state.resizeMode,
    x,
    y,
    w,
    h,
    r,
  }
  if (!madeChanges) {
    cancelPendingResizeRaf()
    commitDragBoxFrame(false, x, y, w, h, r)
    return
  }
  pendingResizeFrame = { madeChanges, x, y, w, h, r }
  if (resizeRafId === null) {
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = null
      const frame = pendingResizeFrame
      pendingResizeFrame = null
      if (frame) {
        commitDragBoxFrame(frame.madeChanges, frame.x, frame.y, frame.w, frame.h, frame.r)
      }
    })
  }
}

const updateDragBoxHandlersPosition = () => {
  if (
    !refs.dragBulletOriginTL ||
    !refs.dragBulletOriginTR ||
    !refs.dragBulletOriginBL ||
    !refs.dragBulletOriginBR ||
    !refs.dragBulletOriginRT ||
    !refs.dragBulletTL ||
    !refs.dragBulletTR ||
    !refs.dragBulletBL ||
    !refs.dragBulletBR ||
    !refs.dragBulletRT ||
    !refs.dragBulletT ||
    !refs.dragBulletR ||
    !refs.dragBulletB ||
    !refs.dragBulletL
  ) {
    return
  }
  const tlRect = refs.dragBulletOriginTL.getBoundingClientRect()
  const trRect = refs.dragBulletOriginTR.getBoundingClientRect()
  const blRect = refs.dragBulletOriginBL.getBoundingClientRect()
  const brRect = refs.dragBulletOriginBR.getBoundingClientRect()
  const rtRect = refs.dragBulletOriginRT.getBoundingClientRect()

  refs.dragBulletTL.style.cssText = `left: ${round(tlRect.left, 0)}px; top: ${round(tlRect.top, 0)}px`
  refs.dragBulletTR.style.cssText = `left: ${round(trRect.left, 0)}px; top: ${round(trRect.top, 0)}px`
  refs.dragBulletBL.style.cssText = `left: ${round(blRect.left, 0)}px; top: ${round(blRect.top, 0)}px`
  refs.dragBulletBR.style.cssText = `left: ${round(brRect.left, 0)}px; top: ${round(brRect.top, 0)}px`
  refs.dragBulletRT.style.cssText = `left: ${round(rtRect.left, 0)}px; top: ${round(rtRect.top, 0)}px`
  refs.dragBulletT.style.cssText = `left: ${getAverage([tlRect.left, trRect.left])}px; top: ${getAverage([tlRect.top, trRect.top])}px`
  refs.dragBulletR.style.cssText = `left: ${getAverage([brRect.left, trRect.left])}px; top: ${getAverage([brRect.top, trRect.top])}px`
  refs.dragBulletB.style.cssText = `left: ${getAverage([blRect.left, brRect.left])}px; top: ${getAverage([blRect.top, brRect.top])}px`
  refs.dragBulletL.style.cssText = `left: ${getAverage([tlRect.left, blRect.left])}px; top: ${getAverage([tlRect.top, blRect.top])}px`
}

const animateDragBoxHandlersPositionToOrigin = (duration = 250): Promise<void> => {
  updateDragBoxHandlersPosition()
  return new Promise((resolve) => {
    const startTime = performance.now()
    const step = (now: number) => {
      updateDragBoxHandlersPosition()
      if (now - startTime < duration) {
        requestAnimationFrame(step)
      } else {
        resolve()
      }
    }
    requestAnimationFrame(step)
  })
}

export const hideDragBox = () => {
  flushPendingResizeFrame()
  state.resizeMode.active = false
  state.resizeMode.w =
    state.resizeMode.h =
    state.resizeMode.x =
    state.resizeMode.y =
    state.resizeMode.r =
      -1
  fadeOutElements(
    [
      refs.dragBox,
      refs.dragBulletTL,
      refs.dragBulletTR,
      refs.dragBulletBL,
      refs.dragBulletBR,
      refs.dragBulletT,
      refs.dragBulletL,
      refs.dragBulletR,
      refs.dragBulletB,
      refs.dragBulletRT,
    ].filter(Boolean) as HTMLElement[]
  )
}

export const toggleFullscreen = () => {
  if (state.fullscreenActive) {
    exitFullscreen()
  } else {
    goFullscreen()
  }
}

export const goFullscreen = (e?: Event) => {
  if (e) preventDefault(e)
  if (state.fullscreenActive) {
    return
  }
  state.fullscreenActive = true
  addGlobalStatus('drawith__EDITOR-FULLSCREEN')
  ColorPicker.closeParams()
  Tools.closeVersions()
  Layers.closeParams()
}

const exitFullscreen = (e?: Event) => {
  if (e) preventDefault(e)
  if (!state.fullscreenActive) {
    return
  }
  state.fullscreenActive = false
  removeGlobalStatus('drawith__EDITOR-FULLSCREEN')
}

const initCanvasCenter = () => {
  if (!refs.canvasCenter) return
  const centerRect = refs.canvasCenter.getBoundingClientRect()
  state.canvas.centerCoordX = round(centerRect.left)
  state.canvas.centerCoordY = round(centerRect.top)
}

export const setTool = (tool: any) => {
  if (tool.name === 'pipette') {
    initPipetteCursor()
  }

  state.currentToolGCO = tool.globalCompositeOperation
  state.currentToolProps = {
    ...state.currentToolProps,
    ...tool,
    globalCompositeOperation: tool.globalCompositeOperation || state.currentLayerGCO,
  }

  if (state.currentToolProps.frameImageName) {
    if (refs.layerContext) {
      setImageShapeIfNeeded(
        refs.layerContext,
        state.currentToolProps.frameImageFile,
        state.currentToolProps.frameImageName,
        state.currentToolProps.color
      )
    }
    if (refs.contextForLine) {
      setImageShapeIfNeeded(
        refs.contextForLine,
        state.currentToolProps.frameImageFile,
        state.currentToolProps.frameImageName,
        state.currentToolProps.color
      )
    }
  }

  Toolbar.setTool(state.currentToolProps)
}

export const setToolColor = (color: string | false, randomColor: boolean) => {
  state.currentToolProps.color = color
  state.currentToolProps.randomColor = randomColor

  if (state.currentToolProps.frameImageName && state.currentToolProps.color) {
    if (refs.layerContext) {
      setImageShapeIfNeeded(
        refs.layerContext,
        state.currentToolProps.frameImageFile,
        state.currentToolProps.frameImageName,
        state.currentToolProps.color
      )
    }
    if (refs.contextForLine) {
      setImageShapeIfNeeded(
        refs.contextForLine,
        state.currentToolProps.frameImageFile,
        state.currentToolProps.frameImageName,
        state.currentToolProps.color
      )
    }
  }

  if (state.currentToolProps.globalCompositeOperation === 'destination-out') {
    Tools.selectLastUsedTool()
  }

  Toolbar.setTool(state.currentToolProps)
}

export const currentCanvasHasZoom = () =>
  state.canvas?.scale !== initialState.canvas.scale ||
  state.canvas?.rotation !== initialState.canvas.rotation ||
  state.canvas?.translateX !== initialState.canvas.translateX ||
  state.canvas?.translateY !== initialState.canvas.translateY

let cursorRafId = 0
let pendingCursorSize = 0
let pendingCursorX = 0
let pendingCursorY = 0

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

const makeTouchStartNearRuler = (touchEvent: any, x: number, y: number) => {
  if (
    state.currentTouch.isDown === false &&
    state.currentLayerIsActive &&
    !state.resizeMode.active &&
    state.currentToolProps.name !== 'pipette' &&
    refs.layerContext
  ) {
    state.currentTouch = { ...initialState.currentTouch }
    state.lastStep = {}
    state.lastAdaptedStep = {}
    updateCurrentTouchType(touchEvent)
    state.currentTouch.isNearRuler = true
    updateCurrentTouchData(state, touchEvent, Params.eventStart, x, y)
    handleTouchStartStep(refs.layerContext)
  }
}

const makeTouchMoveNearRuler = (touchEvent: any, x: number, y: number) => {
  if (state.currentTouch.isDown && refs.layerContext) {
    updateCurrentTouchData(state, touchEvent, Params.eventMove, x, y)
    handleTouchMoveStep(refs.layerContext, true)
  }
}

const makeTouchEndNearRuler = (touchOrX?: any, maybeX?: number, maybeY?: number) => {
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

const sendCoworkingStep = (stepData: StrokeSample, saveStep = false) => {
  if (saveStep) {
    const toolData = removeToolDataKeys({
      name: state.currentToolProps.name,
      version: state.currentToolProps.version,
      color: state.currentToolProps.color,
      globalCompositeOperation: state.currentToolProps.globalCompositeOperation,
      frameImageName: state.currentToolProps.frameImageName,
      customProps: Tools.getCurrentToolCustomProps(),
    })
    if (stepData) {
      Coworking.addStep(removeTouchStepDataKeys(stepData) as any)
    }
    Coworking.sendSteps(Layers.getCurrentSelectedLayerId(), toolData)
    state.stepsSinceLastCoworkingUpdate = 0
  } else {
    Coworking.addStep(removeTouchStepDataKeys(stepData) as any)
    state.stepsSinceLastCoworkingUpdate += 1
  }
}

/**
 * Single agnostic numeric stroke painter entry points:
 * Both local Apple Pencil/touch strokes and remote PeerJS coworker strokes
 * go through `drawStrokeSample`.
 */
const drawStepStart = (context: ExtendedCanvasContext, stepData: StrokeSample, tool: any) =>
  drawStrokeSample(context, { ...stepData, type: 'start' }, tool, true)

const drawStepMove = (context: ExtendedCanvasContext, stepData: StrokeSample, tool: any) =>
  drawStrokeSample(context, { ...stepData, type: 'move' }, tool, true)

const drawStepEnd = (context: ExtendedCanvasContext, stepData: StrokeSample, tool: any) =>
  drawStrokeSample(context, { ...stepData, type: 'end' }, tool, true)

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
    useBucket(context, stepData.x, stepData.y, state.currentToolProps.color)
  } else {
    state.currentTouch.isDown = true
    const thisStepHasDoneSomething = drawStepStart(context, stepData, state.currentToolProps)
    state.currentTouch.drewSomething =
      state.currentTouch.drewSomething ||
      (thisStepHasDoneSomething && coordsAreInsideLayer(stepData.x, stepData.y))
    if (thisStepHasDoneSomething && Coworking.isOpen()) {
      sendCoworkingStep(stepData)
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
      stepData,
      state.currentTouch.drewSomething &&
        state.stepsSinceLastCoworkingUpdate >= state.currentToolProps.stepsToUpdateCoworking - 1
    )
  }
  updateLastStepData(state, stepData)

  Debug.logFps()
}

const shouldUseLineAdaptation = () =>
  state.currentToolProps.size < state.currentToolProps.maxSizeThatNeedsToAdaptLine &&
  (!state.currentToolProps.globalCompositeOperation ||
    state.currentToolProps.globalCompositeOperation === 'source-over')

const handleTouchEndStep = (context: ExtendedCanvasContext) => {
  if (state.currentTouch.isDown === false) {
    return
  }
  state.currentTouch.isDown = state.currentTouch.isNearRuler = false
  refs.toolCursor?.classList.add('displayNone')

  let stepData: StrokeSample = { type: 'end' } as StrokeSample

  if (state.currentTouch.x !== state.lastStep.x || state.currentTouch.y !== state.lastStep.y) {
    stepData = getStepData(state.currentToolProps, state.currentTouch, state.lastStep)
    const thisStepHasDoneSomething = drawStepEnd(context, stepData, state.currentToolProps)
    state.currentTouch.drewSomething =
      state.currentTouch.drewSomething ||
      (thisStepHasDoneSomething && coordsAreInsideLayer(stepData.x, stepData.y))
  }

  if (Coworking.isOpen()) {
    if (state.currentTouch.drewSomething) {
      sendCoworkingStep(stepData, true)
    } else {
      Coworking.clearSteps()
      state.stepsSinceLastCoworkingUpdate = 0
    }
  }

  if (state.currentTouch.drewSomething) {
    requestAnimationFrame(saveStepHistory)
  }
}

const updateCurrentTouchType = (touchEvent: any) => {
  state.currentTouch.type =
    touchEvent?.touchType === TOUCH_TYPE_STYLUS ? TOUCH_TYPE_STYLUS : TOUCH_TYPE_FINGER
  state.currentTouch.touchType = state.currentTouch.type
  if (!state.currentDeviceHasStylus && state.currentTouch.type === TOUCH_TYPE_STYLUS) {
    state.currentDeviceHasStylus = true
  }
}

const onResizeLayerContentTouchStart = () => {
  state.resizeMode.isResizing = true
}

const onDragLayerContentTouchStart = (touchEvent: any) => {
  updateCurrentTouchData(state, touchEvent, Params.eventStart)
  state.resizeMode.startDragX = state.resizeMode.x
  state.resizeMode.startDragY = state.resizeMode.y
}

const onStepTouchStart = (touchEvent: any) => {
  if (!refs.contextForLine || !refs.canvasForLine || !refs.layerContext) return
  state.currentTouch = { ...initialState.currentTouch }
  state.lastStep = {}
  state.lastAdaptedStep = {}
  updateCurrentTouchType(touchEvent)

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

const onDragZoomTouchStart = (touchEvent: any) => {
  if (currentCanvasHasZoom()) {
    onGestureStart(
      getEventCoordX(touchEvent, state.canvas.offset.left),
      getEventCoordY(touchEvent, state.canvas.offset.top),
      1,
      0
    )
  }
}

const onPipetteTouchStart = (touchEvent: any) => {
  Ruler.hide()
  updateCurrentTouchData(state, touchEvent, Params.eventStart)
  updatePipette(
    state.currentTouch.x,
    state.currentTouch.y,
    `${state.currentTouch.eventX}px`,
    `${state.currentTouch.eventY}px`
  )
}

const onTouchStart = (_e: any, touchEvent: any) => {
  if (!state.resizeMode.isResizing) {
    if (touchEvent?.touchType === TOUCH_TYPE_STYLUS) {
      state.currentDeviceHasStylus = true
    }
    if (state.resizeMode.active) {
      onDragLayerContentTouchStart(touchEvent)
    } else if (
      state.currentDeviceHasStylus &&
      touchEvent?.touchType !== TOUCH_TYPE_STYLUS &&
      currentCanvasHasZoom()
    ) {
      onDragZoomTouchStart(touchEvent)
    } else if (state.currentToolProps.name === 'pipette') {
      onPipetteTouchStart(touchEvent)
    } else if (state.currentLayerIsActive) {
      onStepTouchStart(touchEvent)
    }
  }
}

const onResizeLayerContentTouchMove = (
  newResizeState: any,
  left: boolean,
  top: boolean,
  right: boolean,
  bottom: boolean,
  rotation: boolean
) => {
  Debug.logFps()
  if (state.resizeMode.useMagnetism) {
    if (rotation) {
      const newR = roundAngleForSteps(
        newResizeState.r,
        config.resizeRotationStep,
        config.resizeRotationInterval
      )
      if (Math.abs(newR) % config.resizeRotationInterval === 0 && refs.magnetisedLineR) {
        refs.magnetisedLineR.classList.remove('displayNone')
        refs.magnetisedLineR.style.cssText = `
          left: ${(newResizeState.x || 0) / Params.pxScale}px;
          top: ${(newResizeState.y || 0) / Params.pxScale}px;
          transform: translate3d(-50%, -50%, 0px) rotate3d(0, 0, 1, ${newR}deg);
        `
      } else {
        refs.magnetisedLineR?.classList.add('displayNone')
      }
      newResizeState.r = newR
    } else {
      const magnetismCoords = Layers.getMagnetismCoords()
      let lineXCoord: number | false
      let lineYCoord: number | false
      ;[newResizeState, lineXCoord, lineYCoord] = applyRationResizeMagnetism(
        newResizeState,
        magnetismCoords,
        left,
        top,
        right,
        bottom
      )

      if (refs.magnetisedLineY && refs.magnetisedLineX) {
        refs.magnetisedLineY.style.top = `${Number(lineYCoord || 0) / Params.pxScale}px`
        refs.magnetisedLineX.style.left = `${Number(lineXCoord || 0) / Params.pxScale}px`
        refs.magnetisedLineY.classList.toggle('displayNone', !lineYCoord)
        refs.magnetisedLineX.classList.toggle('displayNone', !lineXCoord)
      }
    }
  }

  updateDragBox(
    true,
    newResizeState.x,
    newResizeState.y,
    newResizeState.w,
    newResizeState.h,
    newResizeState.r
  )
}

const onDragLayerContentTouchMove = (touchEvent: any) => {
  Debug.logFps()
  updateCurrentTouchData(state, touchEvent, Params.eventMove)
  let newX = state.resizeMode.startDragX + state.currentTouch.dragX
  let magnetismLineX: number | false = false
  let newY = state.resizeMode.startDragY + state.currentTouch.dragY
  let magnetismLineY: number | false = false

  if (state.resizeMode.useMagnetism) {
    const magnetismCoords = Layers.getMagnetismCoords()
    ;[newX, magnetismLineX] = findValueWithMagnetism(newX, magnetismCoords.x)
    ;[newY, magnetismLineY] = findValueWithMagnetism(newY, magnetismCoords.y)
  }

  if (refs.magnetisedLineX && refs.magnetisedLineY) {
    refs.magnetisedLineX.style.left = `${(magnetismLineX || 0) / Params.pxScale}px`
    refs.magnetisedLineY.style.top = `${(magnetismLineY || 0) / Params.pxScale}px`
    refs.magnetisedLineX.classList.toggle('displayNone', !magnetismLineX)
    refs.magnetisedLineY.classList.toggle('displayNone', !magnetismLineY)
  }

  updateDragBox(
    true,
    round(newX, 1),
    round(newY, 1),
    state.resizeMode.w,
    state.resizeMode.h,
    state.resizeMode.r
  )
}

const processSingleStepTouchMove = (sampleTouchEvent: any) => {
  if (!refs.layerContext || !refs.contextForLine || !refs.canvasForLine) return
  updateCurrentTouchData(state, sampleTouchEvent, Params.eventMove)

  if (shouldUseLineAdaptation()) {
    const adaptedStepLine = shouldThisStepMoveAdaptLine(state)
    if (adaptedStepLine) {
      state.lastStep = { ...state.lastAdaptedStep }
      updateCurrentTouchData(state, sampleTouchEvent, Params.eventMove)
    }
    handleTouchMoveStep(adaptedStepLine ? refs.layerContext : refs.contextForLine, adaptedStepLine)

    if (adaptedStepLine) {
      state.lastAdaptedStep = { ...state.lastStep }
      refs.contextForLine.lastDrawCoordX = refs.layerContext.lastDrawCoordX
      refs.contextForLine.lastDrawCoordY = refs.layerContext.lastDrawCoordY
      refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
    }
  } else {
    handleTouchMoveStep(refs.layerContext, true)
  }
}

const onStepTouchMove = (touchEvent: any) => {
  const coalescedSamples = touchEvent?.coalescedSamples
  if (Array.isArray(coalescedSamples) && coalescedSamples.length > 1) {
    for (let i = 0; i < coalescedSamples.length; i++) {
      processSingleStepTouchMove(coalescedSamples[i])
    }
  } else {
    processSingleStepTouchMove(touchEvent)
  }
}

const onDragZoomTouchMove = (touchEvent: any) => {
  if (
    state.currentDeviceHasStylus &&
    touchEvent?.touchType !== TOUCH_TYPE_STYLUS &&
    state.currentTouch.isZooming
  ) {
    updateCurrentTouchType(touchEvent)
    onGestureChange(
      getEventCoordX(touchEvent, state.canvas.offset.left),
      getEventCoordY(touchEvent, state.canvas.offset.top),
      1,
      0
    )
  }
}

const onPipetteTouchMove = (touchEvent: any) => {
  updateCurrentTouchData(state, touchEvent, Params.eventMove)
  updatePipette(
    state.currentTouch.x,
    state.currentTouch.y,
    `${state.currentTouch.eventX}px`,
    `${state.currentTouch.eventY}px`
  )
}

const onTouchMove = (_e: any, touchEvent: any) => {
  if (!state.resizeMode.isResizing) {
    if (state.resizeMode.active) {
      onDragLayerContentTouchMove(touchEvent)
    } else if (
      state.currentTouch.isZooming &&
      state.currentDeviceHasStylus &&
      touchEvent?.touchType !== TOUCH_TYPE_STYLUS
    ) {
      onDragZoomTouchMove(touchEvent)
    } else if (state.currentToolProps.name === 'pipette') {
      onPipetteTouchMove(touchEvent)
    } else if (state.currentLayerIsActive) {
      onStepTouchMove(touchEvent)
    }
  }
}

const onDragLayerContentTouchEnd = (e: any) => {
  updateCurrentTouchData(state, e, Params.eventEnd)
  refs.magnetisedLineX?.classList.add('displayNone')
  refs.magnetisedLineY?.classList.add('displayNone')
  updateLayerContentCoordsAfterDragResize()
}

const onStepTouchEnd = (e: any) => {
  if (!refs.contextForLine || !refs.canvasForLine || !refs.layerContext) return
  if (shouldUseLineAdaptation()) {
    refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
    if (
      typeof state.lastAdaptedStep.x === 'number' &&
      (state.lastStep.x !== state.lastAdaptedStep.x || state.lastStep.y !== state.lastAdaptedStep.y)
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

const onResizeLayerContentTouchEnd = () => {
  refs.magnetisedLineR?.classList.add('displayNone')
  refs.magnetisedLineY?.classList.add('displayNone')
  refs.magnetisedLineX?.classList.add('displayNone')
  updateLayerContentCoordsAfterDragResize()
  Layers.updateMagnetismCoords(undefined, !!state.resizeMode.r)
  state.resizeMode.isResizing = false
}

const onDragZoomTouchEnd = () => {
  onGestureEnd(0, 0, 1, 0)
}

const onPipetteTouchEnd = () => {
  closePipetteCursor()
}

const onTouchEnd = (e: any) => {
  if (!state.resizeMode.isResizing) {
    if (state.resizeMode.active) {
      onDragLayerContentTouchEnd(e)
    } else if (state.currentDeviceHasStylus && state.currentTouch.isZooming) {
      onDragZoomTouchEnd()
    } else if (state.currentToolProps.name === 'pipette') {
      onPipetteTouchEnd()
    } else if (state.currentLayerIsActive) {
      onStepTouchEnd(e)
    }
  }
}

const onGestureStart = (x: number, y: number, _scale?: number, _rotation?: number) => {
  ColorPicker.closeParams()
  Tools.closeVersions()
  Layers.closeParams()
  x = round(x - state.canvas.offset.left, 1)
  y = round(y - state.canvas.offset.top, 1)
  state.currentTouch.isZooming = true
  const [X, Y] = getOriginalCoordsFromScaleRotation(
    x,
    y,
    state.canvas.originCoordX,
    state.canvas.originCoordY,
    state.canvas.scale,
    state.canvas.rotation
  )
  if (refs.canvasContainer) refs.canvasContainer.style.transition = 'none'
  state.canvas.translateX = round(x - X, 1)
  state.canvas.translateY = round(y - Y, 1)
  state.canvas.translateStartX = state.canvas.translateX
  state.canvas.translateStartY = state.canvas.translateY
  state.canvas.dragStartX = x
  state.canvas.dragStartY = y
  if (state.pipette.isVisible) {
    ColorPicker.deselectPipette(true, true, true)
  }
}

const onGestureChange = (x: number, y: number, scale: number, rotation: number) => {
  scale = getNumberInBetween(round(state.canvas.scale * scale, 4), config.maxScale, config.minScale)
  rotation = round(state.canvas.rotation + rotation, 4)
  x = round(x - state.canvas.offset.left, 1)
  y = round(y - state.canvas.offset.top, 1)
  state.currentTouch.zoomDragChanged = true

  const dx = x - state.canvas.dragStartX
  const dy = y - state.canvas.dragStartY

  state.canvas.translateX = round(state.canvas.translateStartX + dx, 1)
  state.canvas.translateY = round(state.canvas.translateStartY + dy, 1)
  state.canvas.transformOriginX = x
  state.canvas.transformOriginY = y

  updateZoomCss(scale, rotation)
}

const onGestureEnd = (_x: number, _y: number, scale: number, rotation: number) => {
  state.currentTouch.isZooming = false
  if (!state.currentTouch.zoomDragChanged || !refs.canvasCenter || !refs.canvasOrigin) {
    return
  }
  state.currentTouch.zoomDragChanged = false
  scale = getNumberInBetween(round(state.canvas.scale * scale, 4), config.maxScale, config.minScale)
  rotation = round((state.canvas.rotation + rotation) % 360, 4)

  const centerRect = refs.canvasCenter.getBoundingClientRect()
  const centerShiftX = round(Math.abs(state.canvas.centerCoordX - centerRect.left))
  const centerShiftY = round(Math.abs(state.canvas.centerCoordY - centerRect.top))

  if (
    Math.abs(round(scale - state.canvas.initialScale, 2)) < 0.1 &&
    (Math.abs(rotation) <= 5 || Math.abs(Math.abs(rotation) - 360) <= 5) &&
    centerShiftX < 150 &&
    centerShiftY < 150
  ) {
    if (refs.canvasContainer) {
      refs.canvasContainer.style.transition = 'transform 0.25s, transform-origin 0.25s'
    }
    scale = state.canvas.initialScale
    rotation = 0
    state.canvas = {
      ...initialState.canvas,
      scale,
      rotation,
      offset: state.canvas.offset,
      width: state.canvas.width,
      height: state.canvas.height,
      centerCoordX: state.canvas.centerCoordX,
      centerCoordY: state.canvas.centerCoordY,
    }
    if (state.resizeMode.active) {
      animateDragBoxHandlersPositionToOrigin(250)
    }
  } else {
    const originRect = refs.canvasOrigin.getBoundingClientRect()
    state.canvas = {
      ...state.canvas,
      scale,
      rotation,
      dragStartX: 0,
      dragStartY: 0,
      originCoordX: round(originRect.left - state.canvas.offset.left, 1),
      originCoordY: round(originRect.top - state.canvas.offset.top, 1),
    }
  }
  updateZoomCss()
  updateEditorZoomGlobalState(scale)
}

let zoomLabelRafId = 0
let pendingZoomLabelScale = 1

const updateZoomCss = (scale = state.canvas.scale, rotation = state.canvas.rotation) => {
  if (!refs.canvasContainer) return
  pendingZoomLabelScale = scale
  if (!zoomLabelRafId) {
    zoomLabelRafId = requestAnimationFrame(() => {
      zoomLabelRafId = 0
      Messages.update(`${round(pendingZoomLabelScale * 100, 0)}%`)
    })
  }
  refs.canvasContainer.style.transformOrigin = `${state.canvas.transformOriginX}px ${state.canvas.transformOriginY}px`
  refs.canvasContainer.style.transform = `
    scale3d(${scale}, ${scale}, 1)
    rotate3d(0, 0, 1, ${rotation}deg)
    translate3d(${state.canvas.translateX}px, ${state.canvas.translateY}px, 0px)
  `
  document.documentElement.style.setProperty('--canvas-scale', String(scale))
  updateEditorZoomGlobalState(scale)
  if (state.resizeMode.active) {
    updateDragBoxHandlersPosition()
  }
}

export const getCanvasPxSizes = (withCoworking = false): [number, number] => {
  if (withCoworking) {
    const [width, height] = getCanvasContainerPxSizes()
    return [width + spacing.EDITOR_TOOLS_WIDTH, height]
  } else if (Params.deviceHasGoodPerformance) {
    const [containerWidth, containerHeight] = getCanvasContainerPxSizes()
    const maxSide = round(
      Math.min(
        config.maxCanvasSize,
        Math.max(containerWidth, containerHeight) * config.canvasScaleWithGoodPerformance
      ),
      0
    )
    if (containerWidth > containerHeight) {
      return [maxSide, round(maxSide * (containerHeight / containerWidth), 0)]
    } else {
      return [round(maxSide * (containerWidth / containerHeight), 0), maxSide]
    }
  } else {
    return getCanvasContainerPxSizes()
  }
}

const getCanvasContainerPxSizes = (
  screenWidth = Params.width,
  screenHeight = Params.height
): [number, number] => {
  initCanvasOffset(state)
  return [
    round((screenWidth - state.canvas.offset.left - state.canvas.offset.right) * Params.pxScale, 0),
    round(
      (screenHeight - state.canvas.offset.top - state.canvas.offset.bottom) * Params.pxScale,
      0
    ),
  ]
}

const initCanvasDimension = (
  canvasWidth?: number,
  canvasHeight?: number,
  withCoworking = false
) => {
  if (!canvasWidth || !canvasHeight) {
    ;[canvasWidth, canvasHeight] = getCanvasPxSizes(withCoworking)
  }
  if (refs.canvasForLine) {
    refs.canvasForLine.width = state.canvas.width = canvasWidth
    refs.canvasForLine.height = state.canvas.height = canvasHeight
  }

  initCanvasUtils()

  if (withCoworking) {
    const [normalCanvasWidth, normalCanvasHeight] = getCanvasPxSizes(true)
    if (canvasWidth !== normalCanvasWidth || canvasHeight !== normalCanvasHeight) {
      Messages.info(labels.youHaveDifferentScreenSizes)
    }
  }

  const [containerWidth, containerHeight] = getCanvasContainerPxSizes()
  state.canvas.initialScale = state.canvas.scale = getNumberInBetween(
    config.maxScale,
    config.minScale,
    round(Math.min(containerWidth / canvasWidth, containerHeight / canvasHeight), 4)
  )

  if (refs.canvasContainer) {
    refs.canvasContainer.style.cssText = `
      top: ${state.canvas.offset.top}px;
      left: ${state.canvas.offset.left}px;
      width: ${canvasWidth / Params.pxScale}px;
      height: ${canvasHeight / Params.pxScale}px;
    `
  }
  updateZoomCss()
}

const BASE_MAX_SPEED_FACTOR_LENGTH = 150

const onRotate = () => {
  config.maxSpeedFactorLength = round(BASE_MAX_SPEED_FACTOR_LENGTH / (Params.viewportScale || 1), 0)
  if (!state?.canvas) return
  const [containerWidth, containerHeight] = getCanvasContainerPxSizes()
  if (state.canvas.width && state.canvas.height) {
    const newInitialScale = getNumberInBetween(
      config.maxScale,
      config.minScale,
      round(Math.min(containerWidth / state.canvas.width, containerHeight / state.canvas.height), 4)
    )
    const wasAtInitialZoom = !currentCanvasHasZoom()
    state.canvas.initialScale = newInitialScale
    if (refs.canvasContainer) {
      refs.canvasContainer.style.top = `${state.canvas.offset.top}px`
      refs.canvasContainer.style.left = `${state.canvas.offset.left}px`
    }
    if (wasAtInitialZoom) {
      state.canvas = {
        ...initialState.canvas,
        scale: newInitialScale,
        initialScale: newInitialScale,
        rotation: 0,
        offset: state.canvas.offset,
        width: state.canvas.width,
        height: state.canvas.height,
        centerCoordX: state.canvas.centerCoordX,
        centerCoordY: state.canvas.centerCoordY,
      }
      updateZoomCss()
    }
  }
  initCanvasCenter()
  if (refs.canvasOrigin) {
    const originRect = refs.canvasOrigin.getBoundingClientRect()
    state.canvas.originCoordX = round(originRect.left - state.canvas.offset.left, 1)
    state.canvas.originCoordY = round(originRect.top - state.canvas.offset.top, 1)
  }
  if (state.resizeMode?.active) {
    updateDragBoxHandlersPosition()
  }
}

const onKeyDown = (e: KeyboardEvent) => {
  const activeTag = (document.activeElement as HTMLElement | null)?.tagName?.toLowerCase()
  if (activeTag === 'input' || activeTag === 'textarea') {
    return
  }
  if (document.body.classList.contains('drawith__MESSAGE-OPEN')) {
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    preventDefault(e)
    if (e.shiftKey) {
      Layers.redoLayers()
    } else {
      Layers.undoLayers()
    }
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
    preventDefault(e)
    Layers.redoLayers()
  } else if (e.key === 'Escape') {
    if (state.fullscreenActive) {
      exitFullscreen()
    } else if (state.resizeMode?.active) {
      Layers.closeResizeModeIfNeeded()
    } else {
      ColorPicker.closeParams()
      Tools.closeVersions()
      Layers.closeParams()
      Toolbar.closeParams()
    }
  }
}

const getMouseCoords = (e: any): [number, number] => {
  let x = getEventCoordX(e, state.canvas.offset.left)
  let y = getEventCoordY(e, state.canvas.offset.top)
  if (currentCanvasHasZoom()) {
    ;[x, y] = getOriginalCoordsFromScaleRotation(
      x,
      y,
      state.canvas.originCoordX,
      state.canvas.originCoordY,
      state.canvas.scale,
      state.canvas.rotation
    )
  }
  return [round(x * Params.pxScale, 1), round(y * Params.pxScale, 1)]
}

const getEditorChildCenterCoords = (el: HTMLElement): [number, number] => {
  let { centerX, centerY } = getDomRect(el, state.canvas.offset.left, state.canvas.offset.top)
  if (currentCanvasHasZoom()) {
    ;[centerX, centerY] = getOriginalCoordsFromScaleRotation(
      centerX,
      centerY,
      state.canvas.originCoordX,
      state.canvas.originCoordY,
      state.canvas.scale,
      state.canvas.rotation
    )
  }
  return [round(centerX * Params.pxScale, 1), round(centerY * Params.pxScale, 1)]
}

const initDom = async () => {
  const dom = await loadTemplate(editorTemplate, {}, Params.pagesContainer)
  const container = (Array.isArray(dom) ? dom[0] : dom) as HTMLElement
  refs.container = container
  refs.canvasContainer = container.querySelector('.editor__canvas-container')
  refs.canvasOrigin = container.querySelector('.editor__canvas-origin')
  refs.canvasCenter = container.querySelector('.editor__canvas-center')
  refs.canvasForLine = container.querySelector('.editor__canvas-for-line')
  refs.contextForLine = getNewContextForCanvas(refs.canvasForLine!)
  refs.touchLayer = container.querySelector('.editor__touch-layer')
  refs.toolCursor = container.querySelector('.editor__tool-cursor')
  refs.pipetteCursor = container.querySelector('.editor__pipette-cursor')
  refs.pipetteBackground = container.querySelector('.editor__pipette-cursor-image')
  refs.dragBox = container.querySelector('.editor__drag-box')
  refs.magnetisedLineX = container.querySelector('.editor__magnetised-line-x')
  refs.magnetisedLineY = container.querySelector('.editor__magnetised-line-y')
  refs.magnetisedLineR = container.querySelector('.editor__magnetised-line-r')
  refs.dragBulletOriginTL = container.querySelector('.dragBulletOriginTL')
  refs.dragBulletOriginTR = container.querySelector('.dragBulletOriginTR')
  refs.dragBulletOriginBL = container.querySelector('.dragBulletOriginBL')
  refs.dragBulletOriginBR = container.querySelector('.dragBulletOriginBR')
  refs.dragBulletOriginRT = container.querySelector('.dragBulletOriginRT')
  refs.dragBulletTL = container.querySelector('.dragBulletTL')
  refs.dragBulletT = container.querySelector('.dragBulletT')
  refs.dragBulletTR = container.querySelector('.dragBulletTR')
  refs.dragBulletL = container.querySelector('.dragBulletL')
  refs.dragBulletR = container.querySelector('.dragBulletR')
  refs.dragBulletBL = container.querySelector('.dragBulletBL')
  refs.dragBulletB = container.querySelector('.dragBulletB')
  refs.dragBulletBR = container.querySelector('.dragBulletBR')
  refs.dragBulletRT = container.querySelector('.dragBulletRT')

  addResizeBulletsHandlers(
    refs.dragBulletTL!,
    refs.dragBulletTR!,
    refs.dragBulletBR!,
    refs.dragBulletBL!,
    refs.dragBulletT!,
    refs.dragBulletR!,
    refs.dragBulletB!,
    refs.dragBulletL!,
    refs.dragBulletRT!,
    getResizeState,
    getEditorChildCenterCoords,
    getMouseCoords,
    onResizeLayerContentTouchStart,
    onResizeLayerContentTouchMove,
    onResizeLayerContentTouchEnd
  )
  handlePointerEvents(refs.touchLayer!, {
    onSingleTouchStart: onTouchStart,
    onSingleTouchMove: onTouchMove,
    onSingleTouchEnd: onTouchEnd,
    onGestureStart,
    onGestureChange,
    onGestureEnd,
    onTwoFingersSingleTap: Layers.undoLayers,
    onThreeFingersSingleTap: Layers.redoLayers,
    onFourFingersSingleTap: toggleFullscreen,
  })
}

const initSubModules = async (preloadedDrawing: Record<string, any> = {}, options: any = {}) => {
  initEditorUtils(state.canvas.width, state.canvas.height)
  await Toolbar.init(refs.container!)
  await Layers.init(
    refs.container!,
    preloadedDrawing.layers || [],
    state.canvas.width,
    state.canvas.height,
    options.coworkerId ? [options.coworkerId] : []
  )
  await Promise.all([
    Tools.init(
      refs.container!,
      preloadedDrawing.toolsCustomProps || [],
      preloadedDrawing.selectedTool || false
    ),
    ColorPicker.init(
      refs.container!,
      preloadedDrawing.colors || [],
      preloadedDrawing.selectedColorId || -1
    ),
    Ruler.init(refs.container!, {
      touchStart: makeTouchStartNearRuler,
      touchMove: makeTouchMoveNearRuler,
      touchEnd: makeTouchEndNearRuler,
    }),
  ])
}

export const open = async (preloadedDrawingId?: number | string | false, options: any = {}) => {
  coworking = Coworking.requestSession
  state = initState(initialState)
  await initDom()
  Debug.startFpsLog()
  Header.hide()
  addRotationHandler(onRotate)
  document.addEventListener('keydown', onKeyDown)
  addGlobalStatus('drawith__EDITOR-OPEN')
  toggleGlobalStatus('drawith__EDITOR-COWORKING', !!options.withCoworking)

  let preloadedDrawing: Record<string, any> = {}
  const numericId =
    preloadedDrawingId && preloadedDrawingId !== 'false' ? Number(preloadedDrawingId) : 0
  if (numericId) {
    preloadedDrawing = (await getOneDrawing(numericId)) || {}
    if (preloadedDrawing.localDbId) {
      initCanvasDimension(preloadedDrawing.canvasWidth, preloadedDrawing.canvasHeight)
      state.localDbDrawId = numericId
      lastActiveDrawingId = numericId
    } else {
      initCanvasDimension()
    }
  } else {
    if (options.withCoworking) {
      initCanvasDimension(options.coworkingCanvasWidth, options.coworkingCanvasHeight, true)
    } else {
      initCanvasDimension()
    }
  }

  setDraftInterval(true)
  await initSubModules(preloadedDrawing, options)
  if (refs.container) await fadeInElements([refs.container])
  initCanvasCenter()
  state.pageOpened = true
  state.modifiedSinceLastSave = false
  setSpinner(false)
}

export const close = async () => {
  removeGlobalStatus('drawith__EDITOR-OPEN')
  removeGlobalStatus('drawith__EDITOR-COWORKING')
  setDraftInterval(false)
  cleanBucketHistory()
  cleanEditorUtils()
  if (refs.pipetteCursor) {
    refs.pipetteCursor.style.left = '50%'
    refs.pipetteCursor.style.top = '50%'
  }
  Header.show()
  Debug.stopFpsLog()
  removeRotationHandler(onRotate)
  document.removeEventListener('keydown', onKeyDown)
  if (refs.container) await fadeOutElements([refs.container])
  Tools.remove()
  Layers.remove(state.isSavingToGoToFolder)
  ColorPicker.remove()
  Toolbar.remove()
  Ruler.remove()
  removeCanvasUtils()
  state = {}
  coworking = undefined
  cleanRefs(refs)
}
