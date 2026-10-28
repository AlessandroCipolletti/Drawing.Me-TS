import './editor.css'

import Params from 'main/Params'
import * as Coworking from 'modules/Coworking'
import * as Debug from 'modules/Debug'
import * as Header from 'components/Header'
import * as ColorPicker from './components/ColorPicker'
import { PaletteColor } from './components/ColorPicker/ColorPicker'
import * as Toolbar from './components/Toolbar'
import { syncGuidesToolbarChrome } from './components/Toolbar/Toolbar'
import * as Layers from './components/Layers'
import { registerAdjustBarRefs } from './components/Layers/layerAdjustBarRefs'
import {
  registerAdjustBarReposition,
  updateAdjustBarPosition,
} from './components/Layers/layerAdjustBarPosition'
import {
  enterSelectionFilters,
  initLayerAdjustmentBar,
  registerSelectionFilterPanels,
} from './components/Layers/layerAdjustmentPanel'
import { initFloatingFeatureBarDrag } from './floatingFeatureBarDrag'
import * as Tools from './components/Tools'
import * as Ruler from './components/Ruler'
import { registerEditorFacade } from './editorFacade'
import { EditorView, EditorRefs } from './EditorView'
import { mount } from 'ui/mount'
import { setSpinner, preventDefault } from 'utils/domUtils'
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
  saveLayersSidebarExpanded as persistSaveLayersSidebarExpanded,
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
  updateLassoBarPosition,
  updateQuickShapeBarPosition,
  hideQuickShapeBar,
  setLassoModeActive as compositorSetLassoModeActive,
  setLassoModeIsWand as compositorSetLassoModeIsWand,
  setLassoInputCapture as compositorSetLassoInputCapture,
  clearLassoSelectionOverlay as compositorClearLassoSelectionOverlay,
  showLassoSelectionOverlay,
  stopLassoMarchingAnts,
  flushPendingResizeFrame as compositorFlushPendingResizeFrame,
  showDragBox as compositorShowDragBox,
  hideDragBox as compositorHideDragBox,
  animateDragBoxHandlersPositionToOrigin,
  applyToolSelection,
  applyToolColorSelection,
  applyTransformKindChange,
  handleTransformQuadChange,
  handleTransformMeshChange,
  updateResizeBarPosition,
  updateTransformOverlay,
} from './editorCompositor'
import { addQuadCornerHandlers, addWarpMeshHandlers } from './resizeTransformHandlers'
import { TRANSFORM_KINDS } from './resizeTransformSession'
import { QuickShapeVariant } from './editorQuickShape'
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
import { createColorDropController } from './colorDropController'
import { registerEditorCalls } from './editorCalls'
import { findValueWithMagnetism } from './editorUtils'
import { currentCanvasHasZoom, registerCanvasZoomCheck } from './editorCanvasZoom'
import { registerEditorCoworkingPort } from 'app/editorCoworkingPort'
import { resetGuidesState, applyGuidesSnapshot } from './guides/guidesState'
import {
  renderGuidesOverlay,
  scheduleGuidesOverlayRedraw,
  setGuidesFadeClass,
  cancelGuidesOverlayRedraw,
  updateGuidesOriginBulletPosition,
  updateGuidesRotationBulletPosition,
} from './guides/guidesRender'
import {
  bindGuidesOriginBullet,
  bindGuidesRotationBullet,
  clearGuidesTouch,
} from './guides/guidesTouch'
import {
  setGuidesPanelChangeHandler,
  setGuidesPanelCanvasSize,
  syncGuidesPanelUi,
} from './guides/guidesPanel'
import {
  setGuidesCoworkingRedraw,
  applyRemoteSceneGuides,
  clearGuidesCoworking,
  sendSceneGuidesIfCoworking,
} from './guides/guidesCoworking'
import type { SceneGuidesSnapshot } from './guides/guideTypes'

export const config: EditorConfig = editorDefaultConfig

const initialState: EditorState = createInitialEditorState(
  config,
  getAltitudeFactorFromAngle(config.defaultAltitudeAngle, config.maxSupportedStylusAltitudeFactor)
)

let state: EditorState = { ...initialState }
registerCanvasZoomCheck(() => isCanvasZoomed(state, initialState.canvas))
let lastActiveDrawingId: number | false = false
let pointerCleanup: (() => void) | null = null
let activeStrokeSession: ReturnType<typeof createEditorStrokeSession> | null = null
let activeColorDropController: ReturnType<typeof createColorDropController> | null = null

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

export { currentCanvasHasZoom }

export const drawCoworkingMultipleStepsData = (data: CoworkingStepsPayload) => {
  if (state?.pageOpened) {
    drawCoworkingStepsPayload(data, {
      start: drawStepStart,
      move: drawStepMove,
      end: drawStepEnd,
    })
  }
}

const updateDragBoxHandlers = () => {
  if (state.resizeMode.active) {
    updateTransformOverlay(state, refs)
  }
  updateGuidesOriginBulletPosition(refs)
  updateGuidesRotationBulletPosition(refs)
}

let guidesFadeRestoreTimer: ReturnType<typeof setTimeout> | null = null

const restoreGuidesOverlayOpacity = () => {
  if (guidesFadeRestoreTimer) {
    clearTimeout(guidesFadeRestoreTimer)
    guidesFadeRestoreTimer = null
  }
  setGuidesFadeClass('')
  scheduleGuidesOverlayRedraw(state, refs)
}

const scheduleRestoreGuidesOverlayOpacity = () => {
  if (guidesFadeRestoreTimer) clearTimeout(guidesFadeRestoreTimer)
  guidesFadeRestoreTimer = setTimeout(restoreGuidesOverlayOpacity, 400)
}
const syncAdjustBarPosition = () => {
  updateAdjustBarPosition({
    canvasOrigin: refs.canvasOrigin,
    scale: state.canvas.scale,
    rotation: state.canvas.rotation,
    offset: state.canvas.offset,
  })
}

const updateFloatingOptionBars = () => {
  if (state.lassoMode?.active) {
    updateLassoBarPosition(state, refs)
  }
  if (state.quickShapeMode?.active) {
    updateQuickShapeBarPosition(state, refs)
  }
  if (state.resizeMode?.active) {
    updateResizeBarPosition(state, refs)
  }
  syncAdjustBarPosition()
}
const onGestureStart = (x: number, y: number) => handleGestureStart(state, refs, x, y)
const onGestureChange = (x: number, y: number, scale: number, rotation: number) =>
  handleGestureChange(state, refs, config, updateDragBoxHandlers, x, y, scale, rotation)
const onGestureEnd = (_x: number, _y: number, scale: number, rotation: number) => {
  handleGestureEnd(
    state,
    initialState.canvas,
    refs,
    config,
    updateDragBoxHandlers,
    (duration) =>
      animateDragBoxHandlersPositionToOrigin(refs, duration, () => {
        updateGuidesOriginBulletPosition(refs)
        updateGuidesRotationBulletPosition(refs)
      }),
    scale,
    rotation
  )
  renderGuidesOverlay(state, refs)
  scheduleRestoreGuidesOverlayOpacity()
}

export const getCanvasPxSizes = (withCoworking = false): [number, number] =>
  getCanvasPxSizesForEditor(state, config, withCoworking)

const onRotate = () =>
  handleViewportRotate(state, initialState.canvas, refs, config, () => {
    updateDragBoxHandlers()
    updateFloatingOptionBars()
    scheduleGuidesOverlayRedraw(state, refs)
  })
const onKeyDown = (e: KeyboardEvent) =>
  handleEditorKeyDown(state, e, () => activeStrokeSession?.dismissQuickShape())

const bindEditorInput = () => {
  const strokeSession = createEditorStrokeSession({
    state,
    initialCurrentTouch: initialState.currentTouch,
    refs,
    coordsAreInsideLayer,
    setToolColor,
  })
  activeStrokeSession = strokeSession
  activeColorDropController = createColorDropController({
    state,
    coordsAreInsideLayer,
    pageToLayerCoords: (clientX, clientY) => {
      const [x, y] = getMouseCoords(state, initialState.canvas, {
        clientX,
        clientY,
      } as MouseEvent)
      return { x, y }
    },
    performBucketFill: (x, y, color, sendForCoworking) =>
      strokeSession.performBucketFill(x, y, color, undefined, sendForCoworking),
  })
  registerEditorCalls({
    beginColorDropFromSwatch: (hex, clientX, clientY) =>
      activeColorDropController?.beginColorDropFromSwatch(hex, clientX, clientY),
    updateColorDropPointer: (clientX, clientY) =>
      activeColorDropController?.updateColorDropPointer(clientX, clientY),
    endColorDropPointer: (clientX, clientY) =>
      activeColorDropController?.endColorDropPointer(clientX, clientY),
    cancelColorDrop: () => activeColorDropController?.cancelColorDrop(),
    isColorDropActive: () => activeColorDropController?.isColorDropActive() ?? false,
  })
  const snapLayerResizePoint = (x: number, y: number): [number, number] => {
    if (!state.resizeMode.useMagnetism) return [x, y]
    const magnetismCoords = Layers.getMagnetismCoords()
    const [sx] = findValueWithMagnetism(x, magnetismCoords.x)
    const [sy] = findValueWithMagnetism(y, magnetismCoords.y)
    return [sx || x, sy || y]
  }
  const onGuidesGeometryChanged = () => {
    renderGuidesOverlay(state, refs)
    sendSceneGuidesIfCoworking(state.canvas.width, state.canvas.height)
  }
  const onGuidesGeometryPersist = () => {
    persistSetDrawingModified(state, config, setLastActiveDrawingId)
  }
  bindGuidesOriginBullet(
    refs.guidesOriginBullet,
    (e) => getMouseCoords(state, initialState.canvas, e),
    () => ({ width: state.canvas.width, height: state.canvas.height }),
    onGuidesGeometryChanged,
    onGuidesGeometryPersist
  )
  bindGuidesRotationBullet(
    refs.guidesRotationBullet,
    (e) => getMouseCoords(state, initialState.canvas, e),
    onGuidesGeometryChanged,
    onGuidesGeometryPersist
  )
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
    onStylusStrokeNearCanvas: () => {
      setGuidesFadeClass('faded')
      renderGuidesOverlay(state, refs)
    },
    onStylusStrokeEnd: () => {
      scheduleRestoreGuidesOverlayOpacity()
    },
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
    pointerHandlers.onResizeLayerContentTouchEnd,
    0,
    () => state.resizeMode.transformKind
  )
  addQuadCornerHandlers(
    [refs.dragBulletTL!, refs.dragBulletTR!, refs.dragBulletBR!, refs.dragBulletBL!],
    () => state.resizeMode.quad!,
    (e) => getMouseCoords(state, initialState.canvas, e),
    pointerHandlers.onResizeLayerContentTouchStart,
    (quad) => handleTransformQuadChange(state, refs, quad),
    pointerHandlers.onResizeLayerContentTouchEnd,
    () => state.resizeMode.transformKind,
    snapLayerResizePoint
  )
  addWarpMeshHandlers(
    refs.resizeWarpBullets,
    () => state.resizeMode.warpMesh!,
    (e) => getMouseCoords(state, initialState.canvas, e),
    pointerHandlers.onResizeLayerContentTouchStart,
    (mesh) => handleTransformMeshChange(state, refs, mesh),
    pointerHandlers.onResizeLayerContentTouchEnd,
    () => state.resizeMode.transformKind === 'warp',
    snapLayerResizePoint
  )
  refs.resizeTransformBar?.addEventListener(Params.eventStart, preventDefault)
  for (const kind of TRANSFORM_KINDS) {
    refs.resizeTransformKindButtons?.[kind]?.addEventListener(Params.eventStart, (e) => {
      preventDefault(e)
      applyTransformKindChange(state, refs, kind)
    })
  }
  refs.resizeTransformDoneButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    Layers.confirmResizeModeFromToolbar()
  })
  const openLayerOptionsFromSecondaryClick = (e: Event) => {
    if (!Params.isDesktop) return
    const mouse = e as MouseEvent
    if (e.type !== 'contextmenu' && mouse.button !== 2) return
    mouse.preventDefault()
    mouse.stopPropagation()
    Layers.openSelectedLayerOptionsAtPointer(mouse.clientX, mouse.clientY)
  }
  const blockEditorContextMenu = (e: Event) => {
    if (!Params.isDesktop) return
    const target = e.target
    if (!(target instanceof Node) || !refs.container?.contains(target)) return
    e.preventDefault()
  }
  document.addEventListener('contextmenu', blockEditorContextMenu, true)
  refs.touchLayer?.addEventListener('pointerdown', openLayerOptionsFromSecondaryClick, true)
  refs.touchLayer?.addEventListener('contextmenu', openLayerOptionsFromSecondaryClick, true)
  const cleanPointer = handlePointerEvents(refs.touchLayer!, {
    onSingleTouchStart: pointerHandlers.onTouchStart,
    onSingleTouchMove: pointerHandlers.onTouchMove,
    onSingleTouchEnd: pointerHandlers.onTouchEnd,
    onGestureStart,
    onGestureChange,
    onGestureEnd,
    onTwoFingersSingleTap: () => {
      strokeSession.dismissQuickShape()
      void Layers.undoLayers()
    },
    onThreeFingersSingleTap: () => {
      strokeSession.dismissQuickShape()
      void Layers.redoLayers()
    },
    onFourFingersSingleTap: toggleFullscreen,
    isWheelBlocked: () => state.desktopPointerDown,
  })
  pointerCleanup = () => {
    document.removeEventListener('contextmenu', blockEditorContextMenu, true)
    refs.touchLayer?.removeEventListener('pointerdown', openLayerOptionsFromSecondaryClick, true)
    refs.touchLayer?.removeEventListener('contextmenu', openLayerOptionsFromSecondaryClick, true)
    cleanPointer()
  }
  refs.adjustBar?.addEventListener(Params.eventStart, preventDefault)
  registerAdjustBarRefs({
    adjustBar: refs.adjustBar,
    adjustBarPicker: refs.adjustBarPicker,
    adjustBarEdit: refs.adjustBarEdit,
    adjustFilterHue: refs.adjustFilterHue,
    adjustFilterSaturation: refs.adjustFilterSaturation,
    adjustFilterBrightness: refs.adjustFilterBrightness,
    adjustFilterTemperature: refs.adjustFilterTemperature,
    adjustFilterTint: refs.adjustFilterTint,
    adjustFilterVibrance: refs.adjustFilterVibrance,
    adjustFilterCurve: refs.adjustFilterCurve,
    adjustFilterBlur: refs.adjustFilterBlur,
    adjustFilterSharpness: refs.adjustFilterSharpness,
    adjustBarClose: refs.adjustBarClose,
    adjustBarBack: refs.adjustBarBack,
    adjustBarReset: refs.adjustBarReset,
    adjustBarFilterName: refs.adjustBarFilterName,
    adjustSlider1Cell: refs.adjustSlider1Cell,
    adjustSlider1: refs.adjustSlider1,
    adjustSlider1Cursor: refs.adjustSlider1Cursor,
    adjustSlider1Label: refs.adjustSlider1Label,
    adjustSlider2Cell: refs.adjustSlider2Cell,
    adjustSlider2: refs.adjustSlider2,
    adjustSlider2Cursor: refs.adjustSlider2Cursor,
    adjustSlider2Label: refs.adjustSlider2Label,
  })
  registerSelectionFilterPanels(refs.lassoBarActions, refs.lassoBarFilters, () =>
    updateLassoBarPosition(state, refs)
  )
  initLayerAdjustmentBar()
  registerAdjustBarReposition(syncAdjustBarPosition)
  initFloatingFeatureBarDrag(() => state.canvas.offset)
  refs.lassoBar?.addEventListener(Params.eventStart, preventDefault)
  refs.lassoInvertButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    state.lassoMode.inverted = !state.lassoMode.inverted
    refs.lassoInvertButton?.classList.toggle('selected', state.lassoMode.inverted)
    void Layers.updateLassoSelectionOptions(state.lassoMode.inverted)
  })
  refs.lassoMoveButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    if (!state.lassoMode.hasPixels) return
    state.lassoMode.isMoveMode = !state.lassoMode.isMoveMode
    refs.lassoMoveButton?.classList.toggle('selected', state.lassoMode.isMoveMode)
  })
  refs.lassoTransformButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    Layers.startTransformLassoSelectionInPlace()
  })
  refs.lassoCutButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    void Layers.cutLassoSelectionToNewLayer()
  })
  refs.lassoCopyButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    void Layers.copyLassoSelectionToNewLayer()
  })
  refs.lassoClearButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    void Layers.clearLassoSelection()
  })
  refs.lassoFiltersButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    enterSelectionFilters()
  })
  refs.lassoCancelButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    Layers.cancelLassoSelection()
  })
  refs.quickShapeBar?.addEventListener(Params.eventStart, preventDefault)
  if (refs.quickShapeVariantButtons) {
    for (const [variantId, btn] of Object.entries(refs.quickShapeVariantButtons)) {
      btn.addEventListener(Params.eventStart, (e) => {
        preventDefault(e)
        strokeSession.applyQuickShapeVariant(variantId as QuickShapeVariant)
      })
    }
  }
  refs.quickShapeCancelButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    strokeSession.dismissQuickShape()
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
  resetGuidesState(state.canvas.width, state.canvas.height)
  applyGuidesSnapshot(
    preloadedDrawing.sceneGuides as SceneGuidesSnapshot | undefined,
    state.canvas.width,
    state.canvas.height
  )
  setGuidesPanelCanvasSize(state.canvas.width, state.canvas.height)
  setGuidesPanelChangeHandler(() => {
    renderGuidesOverlay(state, refs)
    syncGuidesToolbarChrome()
    persistSetDrawingModified(state, config, setLastActiveDrawingId)
  })
  setGuidesCoworkingRedraw(() => {
    renderGuidesOverlay(state, refs)
    syncGuidesPanelUi()
    syncGuidesToolbarChrome()
  })
  await Toolbar.init(refs.container!)
  await Layers.init(
    refs.container!,
    preloadedDrawing.layers || [],
    state.canvas.width,
    state.canvas.height,
    options.coworkerId ? [options.coworkerId] : [],
    Boolean(preloadedDrawing.layersSidebarExpanded)
  )
  await Promise.all([
    Tools.init(
      refs.container!,
      preloadedDrawing.toolsCustomProps || [],
      preloadedDrawing.selectedTool || false,
      preloadedDrawing.paper
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
  renderGuidesOverlay(state, refs)
  syncGuidesToolbarChrome()
  state.pageOpened = true
  state.modifiedSinceLastSave = false
  setSpinner(false)
}

export const close = async () => {
  activeStrokeSession?.dismissQuickShape()
  activeStrokeSession = null
  activeColorDropController?.cancelColorDrop()
  activeColorDropController = null
  stopLassoMarchingAnts()
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
  clearGuidesTouch()
  clearGuidesCoworking()
  cancelGuidesOverlayRedraw()
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
    activeStrokeSession?.dismissQuickShape()
    Layers.clearCurrentLayer()
  },
  setTool: (tool: Partial<CurrentToolProps>) => {
    activeStrokeSession?.dismissQuickShape()
    applyToolSelection(state, initialState.canvas, refs, coordsAreInsideLayer, tool)
  },
  setToolColor,
  saveDrawingsPalette: (colors: PaletteColor[] = []) => persistSaveDrawingsPalette(state, colors),
  saveLayersSidebarExpanded: (expanded: boolean) =>
    persistSaveLayersSidebarExpanded(state, expanded),
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
  showDragBox: (x, y, w, h, useMagnetism) => {
    activeStrokeSession?.dismissQuickShape()
    compositorShowDragBox(state, refs, x, y, w, h, useMagnetism)
  },
  flushPendingResizeFrame: () => compositorFlushPendingResizeFrame(state, refs),
  setLassoModeActive: (active, isWand) => {
    if (active) activeStrokeSession?.dismissQuickShape()
    compositorSetLassoModeActive(state, refs, active, isWand)
  },
  setLassoModeIsWand: (isWand) => compositorSetLassoModeIsWand(state, isWand),
  setLassoInputCapture: (capture) => compositorSetLassoInputCapture(state, capture),
  clearLassoSelectionOverlay: () => compositorClearLassoSelectionOverlay(state, refs),
  updateLassoSelectionUi: (bounds) => showLassoSelectionOverlay(state, refs, bounds),
  dismissQuickShape: () => {
    activeStrokeSession?.dismissQuickShape()
    hideQuickShapeBar(state, refs)
  },
  appendLayer: (layerCanvas) => compositorAppendLayer(refs, layerCanvas),
  updateEditorLayer: (z, o, gco, a) => compositorUpdateEditorLayer(state, refs, z, o, gco, a),
  setLayerContext: (ctx) => {
    activeStrokeSession?.dismissQuickShape()
    hideQuickShapeBar(state, refs)
    compositorSetLayerContext(state, refs, ctx)
  },
})

registerEditorCoworkingPort({
  getCanvasPxSizes,
  drawCoworkingMultipleStepsData,
  applySceneGuidesFromCoworker: (guides) =>
    applyRemoteSceneGuides(guides as SceneGuidesSnapshot, state.canvas.width, state.canvas.height),
})
