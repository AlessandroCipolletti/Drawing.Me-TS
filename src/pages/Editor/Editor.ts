import './editor.css'

import Params from 'main/Params'
import * as Coworking from 'modules/Coworking'
import * as Debug from 'modules/Debug'
import * as Header from 'components/Header'
import * as ColorPicker from './components/ColorPicker'
import { PaletteColor } from './components/ColorPicker/ColorPicker'
import * as Toolbar from './components/Toolbar'
import * as Layers from './components/Layers'
import * as Tools from './components/Tools'
import * as Ruler from './components/Ruler'
import { registerEditorFacade } from './editorFacade'
import { EditorView, EditorRefs } from './EditorView'
import { mount } from 'ui/mount'
import { setSpinner } from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import {
  addGlobalStatus,
  removeGlobalStatus,
  toggleGlobalStatus,
  addRotationHandler,
  removeRotationHandler,
  cleanRefs,
} from 'utils/moduleUtils'
import { getAltitudeFactorFromAngle } from 'utils/mathUtils'
import { getOneDrawing } from 'utils/localDbUtils'
import { handlePointerEvents } from 'utils/pointerEventsUtils'
import { addResizeBulletsHandlers } from 'utils/uiUtils'
import {
  remove as removeCanvasUtils,
  cleanBucketHistory,
  getNewContextForCanvas,
} from 'utils/canvasUtils'
import { initEditorUtils, cleanEditorUtils, initState } from './editorUtils'
import { editorDefaultConfig } from './config'
import { drawCoworkingStepsPayload } from './editorCoworkingBridge'
import {
  setDraftInterval,
  saveCopy as persistSaveCopy,
  saveDrawingsPalette as persistSaveDrawingsPalette,
  setDrawingModified as persistSetDrawingModified,
  saveAndGoToFolder as persistSaveAndGoToFolder,
} from './editorPersistence'
import {
  isCanvasZoomed,
  initCanvasCenter,
  handleGestureStart,
  handleGestureChange,
  handleGestureEnd,
  getCanvasPxSizesForEditor,
  initCanvasDimension,
  handleViewportRotate,
  getMouseCoords,
  getEditorChildCenterCoords,
} from './editorViewport'
import {
  changePaper as compositorChangePaper,
  appendLayer as compositorAppendLayer,
  setLayerContext as compositorSetLayerContext,
  updateEditorLayer as compositorUpdateEditorLayer,
  updateDragBoxHandlersPosition,
  flushPendingResizeFrame as compositorFlushPendingResizeFrame,
  showDragBox as compositorShowDragBox,
  hideDragBox as compositorHideDragBox,
  animateDragBoxHandlersPositionToOrigin,
  applyToolSelection,
  applyToolColorSelection,
} from './editorCompositor'
import {
  toggleFullscreen as lifecycleToggleFullscreen,
  handleEditorKeyDown,
  hidePipetteCursor as lifecycleHidePipetteCursor,
} from './editorLifecycle'
import {
  CoworkingStepsPayload,
  CurrentToolProps,
  EditorConfig,
  EditorOpenOptions,
  EditorState,
  PreloadedDrawingRecord,
  createInitialEditorRefs,
  createInitialEditorState,
} from './editorTypes'
import {
  createEditorStrokeSession,
  drawStepStart,
  drawStepMove,
  drawStepEnd,
} from './editorStrokeSession'
import { createEditorPointerHandlers } from './editorPointerRouter'

export const config: EditorConfig = editorDefaultConfig

const initialState: EditorState = createInitialEditorState(
  config,
  getAltitudeFactorFromAngle(config.defaultAltitudeAngle, config.maxSupportedStylusAltitudeFactor)
)

let state: EditorState = { ...initialState }
let lastActiveDrawingId: number | false = false
let pointerCleanup: (() => void) | null = null

const setLastActiveDrawingId = (id: number) => {
  lastActiveDrawingId = id
}

export const getLastActiveDrawingId = (): number | false =>
  state?.localDbDrawId || lastActiveDrawingId

const refs: EditorRefs = createInitialEditorRefs()

export let coworking: ((coworkerSocketId: string) => void) | undefined

const coordsAreInsideLayer = (x: number, y: number) =>
  x > 0 && y > 0 && x <= state.canvas.width && y <= state.canvas.height
const toggleFullscreen = (e?: Event) => lifecycleToggleFullscreen(state, e)
const setToolColor = (color: string | false, randomColor: boolean) =>
  applyToolColorSelection(state, refs, color, randomColor)

export const currentCanvasHasZoom = () => isCanvasZoomed(state, initialState.canvas)

export const drawCoworkingMultipleStepsData = (data: CoworkingStepsPayload) => {
  if (state?.pageOpened) {
    drawCoworkingStepsPayload(data, {
      start: drawStepStart,
      move: drawStepMove,
      end: drawStepEnd,
    })
  }
}

const updateDragBoxHandlers = () => updateDragBoxHandlersPosition(refs)
const onGestureStart = (x: number, y: number) => handleGestureStart(state, refs, x, y)
const onGestureChange = (x: number, y: number, scale: number, rotation: number) =>
  handleGestureChange(state, refs, config, updateDragBoxHandlers, x, y, scale, rotation)
const onGestureEnd = (_x: number, _y: number, scale: number, rotation: number) =>
  handleGestureEnd(
    state,
    initialState.canvas,
    refs,
    config,
    updateDragBoxHandlers,
    (duration) => animateDragBoxHandlersPositionToOrigin(refs, duration),
    scale,
    rotation
  )

export const getCanvasPxSizes = (withCoworking = false): [number, number] =>
  getCanvasPxSizesForEditor(state, config, withCoworking)

const onRotate = () =>
  handleViewportRotate(state, initialState.canvas, refs, config, updateDragBoxHandlers)
const onKeyDown = (e: KeyboardEvent) => handleEditorKeyDown(state, e)

const bindEditorInput = () => {
  const strokeSession = createEditorStrokeSession({
    state,
    initialCurrentTouch: initialState.currentTouch,
    refs,
    coordsAreInsideLayer,
    setToolColor,
  })
  const pointerHandlers = createEditorPointerHandlers({
    state,
    refs,
    config,
    coordsAreInsideLayer,
    currentCanvasHasZoom,
    onGestureStart,
    onGestureChange,
    onGestureEnd,
    session: strokeSession,
  })
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
    () => ({ ...state.resizeMode }),
    (el) => getEditorChildCenterCoords(state, initialState.canvas, el),
    (e) => getMouseCoords(state, initialState.canvas, e),
    pointerHandlers.onResizeLayerContentTouchStart,
    pointerHandlers.onResizeLayerContentTouchMove,
    pointerHandlers.onResizeLayerContentTouchEnd
  )
  pointerCleanup = handlePointerEvents(refs.touchLayer!, {
    onSingleTouchStart: pointerHandlers.onTouchStart,
    onSingleTouchMove: pointerHandlers.onTouchMove,
    onSingleTouchEnd: pointerHandlers.onTouchEnd,
    onGestureStart,
    onGestureChange,
    onGestureEnd,
    onTwoFingersSingleTap: Layers.undoLayers,
    onThreeFingersSingleTap: Layers.redoLayers,
    onFourFingersSingleTap: toggleFullscreen,
    isWheelBlocked: () => state.desktopPointerDown,
  })
  return strokeSession
}

export const open = async (
  preloadedDrawingId?: number | string | false,
  options: EditorOpenOptions = {}
) => {
  coworking = Coworking.requestSession
  state = initState(initialState)
  mount(Params.pagesContainer!, EditorView({ refs }))
  refs.contextForLine = getNewContextForCanvas(refs.canvasForLine!)
  const strokeSession = bindEditorInput()

  Debug.startFpsLog()
  Header.hide()
  addRotationHandler(onRotate)
  document.addEventListener('keydown', onKeyDown)
  addGlobalStatus('drawith__EDITOR-OPEN')
  toggleGlobalStatus('drawith__EDITOR-COWORKING', !!options.withCoworking)

  let preloadedDrawing: PreloadedDrawingRecord = {}
  const numericId =
    preloadedDrawingId && preloadedDrawingId !== 'false' ? Number(preloadedDrawingId) : 0
  if (numericId) {
    preloadedDrawing =
      ((await getOneDrawing(numericId)) as PreloadedDrawingRecord | undefined) || {}
    if (preloadedDrawing.localDbId) {
      initCanvasDimension(
        state,
        refs,
        config,
        updateDragBoxHandlers,
        preloadedDrawing.canvasWidth,
        preloadedDrawing.canvasHeight
      )
      state.localDbDrawId = numericId
      lastActiveDrawingId = numericId
    } else {
      initCanvasDimension(state, refs, config, updateDragBoxHandlers)
    }
  } else if (options.withCoworking) {
    initCanvasDimension(
      state,
      refs,
      config,
      updateDragBoxHandlers,
      options.coworkingCanvasWidth,
      options.coworkingCanvasHeight,
      true
    )
  } else {
    initCanvasDimension(state, refs, config, updateDragBoxHandlers)
  }

  setDraftInterval(state, config, true, setLastActiveDrawingId)
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
      preloadedDrawing.selectedColorId ?? -1
    ),
    Ruler.init(refs.container!, {
      touchStart: strokeSession.makeTouchStartNearRuler,
      touchMove: strokeSession.makeTouchMoveNearRuler,
      touchEnd: strokeSession.makeTouchEndNearRuler,
    }),
  ])

  if (refs.container) await fadeInElements([refs.container])
  initCanvasCenter(state, refs)
  state.pageOpened = true
  state.modifiedSinceLastSave = false
  setSpinner(false)
}

export const close = async () => {
  removeGlobalStatus('drawith__EDITOR-OPEN')
  removeGlobalStatus('drawith__EDITOR-COWORKING')
  setDraftInterval(state, config, false, setLastActiveDrawingId)
  pointerCleanup?.()
  pointerCleanup = null
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
  state = initState(initialState)
  coworking = undefined
  cleanRefs(refs)
}

registerEditorFacade({
  saveCopy: () => persistSaveCopy(state, config),
  saveAndGoToFolder: () => persistSaveAndGoToFolder(state, config, setLastActiveDrawingId),
  toggleFullscreen,
  changePaper: (paper) => compositorChangePaper(refs, paper),
  clear: () => {
    Layers.clearCurrentLayer()
  },
  setTool: (tool: Partial<CurrentToolProps>) =>
    applyToolSelection(state, initialState.canvas, refs, coordsAreInsideLayer, tool),
  setToolColor,
  saveDrawingsPalette: (colors: PaletteColor[] = []) => persistSaveDrawingsPalette(state, colors),
  hidePipetteCursor: () => lifecycleHidePipetteCursor(state, refs),
  setDrawingModified: () => persistSetDrawingModified(state, config, setLastActiveDrawingId),
  setDesktopCanvasPanMode: (active: boolean) => {
    state.desktopCanvasPanMode = active
    refs.touchLayer?.classList.toggle('editor__touch-layer-pan', active)
    if (!active) {
      refs.touchLayer?.classList.remove('editor__touch-layer-panning')
    }
  },
  hideDragBox: () => compositorHideDragBox(state, refs),
  showDragBox: (x, y, w, h, useMagnetism) =>
    compositorShowDragBox(state, refs, x, y, w, h, useMagnetism),
  flushPendingResizeFrame: () => compositorFlushPendingResizeFrame(state, refs),
  appendLayer: (layerCanvas) => compositorAppendLayer(refs, layerCanvas),
  updateEditorLayer: (z, o, gco, a) => compositorUpdateEditorLayer(state, refs, z, o, gco, a),
  setLayerContext: (ctx) => compositorSetLayerContext(state, refs, ctx),
})
