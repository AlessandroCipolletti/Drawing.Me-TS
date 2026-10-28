import { ToolConfigProps } from './config'
import { ExtendedCanvasContext } from 'utils/canvasUtils'
import type { QuadCorners, WarpMesh } from 'utils/imageWarp'
import type { GradientHandleTarget, GradientKind } from './gradientFill'

export type TransformKind = 'resize' | 'distort' | 'perspective' | 'warp'

export type ResizeFramePayload = {
  x: number
  y: number
  w: number
  h: number
  r: number
  transformKind: TransformKind
  quad: QuadCorners | null
  warpMesh: WarpMesh | null
  /** Coarse warp sampling while a handle is actively dragged. */
  previewCoarse?: boolean
}

export interface EditorRefs {
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
  lassoCanvas: HTMLCanvasElement | null
  lassoBar: HTMLElement | null
  lassoBarActions: HTMLElement | null
  lassoBarFilters: HTMLElement | null
  lassoFiltersButton: HTMLElement | null
  lassoInvertButton: HTMLElement | null
  lassoMoveButton: HTMLElement | null
  lassoTransformButton: HTMLElement | null
  lassoCutButton: HTMLElement | null
  lassoCopyButton: HTMLElement | null
  lassoClearButton: HTMLElement | null
  lassoCancelButton: HTMLElement | null
  quickShapeBar: HTMLElement | null
  quickShapeVariantButtons: Record<string, HTMLElement>
  quickShapeCancelButton: HTMLElement | null
  resizeTransformBar: HTMLElement | null
  resizeTransformKindButtons: Partial<Record<TransformKind, HTMLElement>>
  resizeTransformDoneButton: HTMLElement | null
  resizeQuadOverlay: HTMLCanvasElement | null
  resizeMeshOverlay: HTMLCanvasElement | null
  resizeWarpBullets: Array<HTMLElement | null>
  guidesOverlay: HTMLCanvasElement | null
  guidesOriginAnchor: HTMLElement | null
  guidesOriginBullet: HTMLElement | null
  guidesRotationAnchor: HTMLElement | null
  guidesRotationBullet: HTMLElement | null
  adjustBar: HTMLElement | null
  adjustBarPicker: HTMLElement | null
  adjustBarEdit: HTMLElement | null
  adjustFilterHue: HTMLElement | null
  adjustFilterSaturation: HTMLElement | null
  adjustFilterBrightness: HTMLElement | null
  adjustFilterTemperature: HTMLElement | null
  adjustFilterTint: HTMLElement | null
  adjustFilterVibrance: HTMLElement | null
  adjustFilterCurve: HTMLElement | null
  adjustFilterBlur: HTMLElement | null
  adjustFilterSharpness: HTMLElement | null
  adjustBarClose: HTMLElement | null
  adjustBarBack: HTMLElement | null
  adjustBarReset: HTMLElement | null
  adjustBarFilterName: HTMLElement | null
  adjustSlider1Cell: HTMLElement | null
  adjustSlider1: HTMLElement | null
  adjustSlider1Cursor: HTMLElement | null
  adjustSlider1Label: HTMLElement | null
  adjustSlider2Cell: HTMLElement | null
  adjustSlider2: HTMLElement | null
  adjustSlider2Cursor: HTMLElement | null
  adjustSlider2Label: HTMLElement | null
  gradientOverlay: HTMLCanvasElement | null
  gradientBar: HTMLElement | null
  gradientTypeButtons: Partial<Record<GradientKind, HTMLElement>>
  gradientSwatch1: HTMLElement | null
  gradientSwatch2: HTMLElement | null
  gradientColorInput1: HTMLInputElement | null
  gradientColorInput2: HTMLInputElement | null
  gradientCloseButton: HTMLElement | null
}

export const createInitialEditorRefs = (): EditorRefs => ({
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
  lassoCanvas: null,
  lassoBar: null,
  lassoBarActions: null,
  lassoBarFilters: null,
  lassoFiltersButton: null,
  lassoInvertButton: null,
  lassoMoveButton: null,
  lassoTransformButton: null,
  lassoCutButton: null,
  lassoCopyButton: null,
  lassoClearButton: null,
  lassoCancelButton: null,
  quickShapeBar: null,
  quickShapeVariantButtons: {},
  quickShapeCancelButton: null,
  resizeTransformBar: null,
  resizeTransformKindButtons: {},
  resizeTransformDoneButton: null,
  resizeQuadOverlay: null,
  resizeMeshOverlay: null,
  resizeWarpBullets: [],
  guidesOverlay: null,
  guidesOriginAnchor: null,
  guidesOriginBullet: null,
  guidesRotationAnchor: null,
  guidesRotationBullet: null,
  adjustBar: null,
  adjustBarPicker: null,
  adjustBarEdit: null,
  adjustFilterHue: null,
  adjustFilterSaturation: null,
  adjustFilterBrightness: null,
  adjustFilterTemperature: null,
  adjustFilterTint: null,
  adjustFilterVibrance: null,
  adjustFilterCurve: null,
  adjustFilterBlur: null,
  adjustFilterSharpness: null,
  adjustBarClose: null,
  adjustBarBack: null,
  adjustBarReset: null,
  adjustBarFilterName: null,
  adjustSlider1Cell: null,
  adjustSlider1: null,
  adjustSlider1Cursor: null,
  adjustSlider1Label: null,
  adjustSlider2Cell: null,
  adjustSlider2: null,
  adjustSlider2Cursor: null,
  adjustSlider2Label: null,
  gradientOverlay: null,
  gradientBar: null,
  gradientTypeButtons: {},
  gradientSwatch1: null,
  gradientSwatch2: null,
  gradientColorInput1: null,
  gradientColorInput2: null,
  gradientCloseButton: null,
})

export interface EditorTouchState {
  type: string
  touchType: string
  x: number
  y: number
  rawX?: number
  rawY?: number
  velocityX?: number
  velocityY?: number
  midX: number
  midY: number
  eventX: number
  eventY: number
  startDragX: number
  startDragY: number
  dragX: number
  dragY: number
  force: number
  tangentialPressure?: number
  drewSomething: boolean
  isNearRuler: boolean
  isDown: boolean
  isZooming: boolean
  zoomDragChanged: boolean
  altitudeAngle: number
  altitudeFactor: number
  azimuthAngle: number
  twist?: number
  hasTwist?: boolean
  rotation: number
  pathRotation: number
  stepLength: number
  speedFactor: number
  timeStamp?: number
  canHandleStylusRotation: boolean
}

export interface EditorCanvasState {
  width: number
  height: number
  scale: number
  initialScale: number
  rotation: number
  dragStartX: number
  dragStartY: number
  translateX: number
  translateY: number
  translateStartX?: number
  translateStartY?: number
  transformOriginX: number
  transformOriginY: number
  originCoordX: number
  originCoordY: number
  centerCoordX: number
  centerCoordY: number
  offset: {
    left: number
    top: number
    right: number
    bottom: number
  }
}

export interface ResizeModeState {
  active: boolean
  useMagnetism: boolean
  isResizing: boolean
  transformKind: TransformKind
  x: number
  y: number
  w: number
  h: number
  r: number
  quad: QuadCorners | null
  warpMesh: WarpMesh | null
  startDragX: number
  startDragY: number
  fromLeft?: boolean
  fromTop?: boolean
  fromRight?: boolean
  fromBottom?: boolean
}

interface LassoModeState {
  active: boolean
  isWand: boolean
  captureInput: boolean
  isDrawing: boolean
  hasSelection: boolean
  hasPixels: boolean
  isMoveMode: boolean
  isDraggingMove: boolean
  inverted: boolean
  points: Array<[number, number]>
  rings: Array<Array<[number, number]>>
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface QuickShapeModeState {
  active: boolean
  variant: string
  availableVariants: string[]
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface GradientModeState {
  active: boolean
  kind: GradientKind
  color1: string
  color2: string
  initializedColors: boolean
  hasActiveEdit: boolean
  isDragging: boolean
  draggingHandle: GradientHandleTarget | null
  layerId: string
  x0: number
  y0: number
  x1: number
  y1: number
}

interface PipetteState {
  bg: string
  isVisible: boolean
  currentColor: string | false
  isOnCanvas: boolean
  context: CanvasRenderingContext2D | null
}

interface ColorDropState {
  active: boolean
  fillHex: string
}

export interface CurrentToolProps extends Omit<ToolConfigProps, 'color'> {
  color: string
  randomColor: boolean
  version?: string | number
  versionName?: string
}

interface EditorStepSnapshot {
  x?: number
  y?: number
  midX?: number
  midY?: number
  alpha?: number
  size?: number
  rotation?: number
  aspectRatio?: number
  speedFactor?: number
  timeStamp?: number
  strokeDistance?: number
  strokeRotationOffset?: number
}

export interface EditorState {
  pageOpened: boolean
  modifiedSinceLastSave: boolean
  modifiedSinceLastCopy: boolean
  currentTouch: EditorTouchState
  lastStep: EditorStepSnapshot
  lastAdaptedStep: EditorStepSnapshot
  lastLineAdaptationTimestamp: number
  stepsSinceLastLineAdaptation: number
  pxDistanceSinceLastLineAdaptation: number
  hasPredictedOverlay?: boolean
  fullscreenActive: boolean
  canvas: EditorCanvasState
  resizeMode: ResizeModeState
  lassoMode: LassoModeState
  quickShapeMode: QuickShapeModeState
  gradientMode: GradientModeState
  pipette: PipetteState
  colorDrop: ColorDropState
  currentLayerGCO: GlobalCompositeOperation
  currentToolGCO?: GlobalCompositeOperation
  currentLayerIsActive: boolean
  currentDeviceHasStylus: boolean
  desktopCanvasPanMode: boolean
  desktopPointerDown: boolean
  drawnStepsSinceDraft: number
  draftInterval: ReturnType<typeof setInterval> | false
  currentSavingDraw: boolean
  stepsSinceLastCoworkingUpdate: number
  localDbDrawId: number | false
  isSavingToGoToFolder: boolean
  currentToolProps: CurrentToolProps
}

export interface EditorConfig {
  draftTimeInterval: number
  draftStepsInterval: number
  stepsRequiredToMakeACopy: number
  maxSpeedFactorLength: number
  defaultForceTouch: number
  defaultAltitudeAngle: number
  initialForceTouchBugValue: number
  maxSupportedStylusAltitudeFactor: number
  defaultToolParams: ToolConfigProps
  maxScale: number
  minScale: number
  maxCanvasSize: number
  canvasScaleWithGoodPerformance: number
  minAltitudeFactorToHandleRotation: number
  resizeRotationStep: number
  resizeRotationInterval: number
  draftInfoDuration: number
}

export interface PointerTouchEvent {
  type?: string
  touchType?: string
  pointerType?: string
  shiftKey?: boolean
  pageX?: number
  pageY?: number
  clientX?: number
  clientY?: number
  force?: number
  pressure?: number
  tangentialPressure?: number
  altitudeAngle?: number
  azimuthAngle?: number
  twist?: number
  hasTwist?: boolean
  rotationAngle?: number
  timeStamp?: number
  touches?: PointerTouchEvent[]
  changedTouches?: PointerTouchEvent[]
  coalescedSamples?: PointerTouchEvent[]
  predictedSamples?: PointerTouchEvent[]
  target?: EventTarget | null
}

export interface CoworkingStepsPayload {
  layerId: string
  steps: Array<[string, ...Array<number | null | undefined>]>
  tool: [
    string,
    string | number | undefined,
    string | false,
    number,
    string | false,
    Record<string, unknown>,
  ]
  replaceStroke?: 'current' | 'last'
}

export interface EditorOpenOptions {
  withCoworking?: boolean
  coworkerId?: string
  coworkingCanvasWidth?: number
  coworkingCanvasHeight?: number
}

export interface PreloadedDrawingRecord {
  localDbId?: number
  canvasWidth?: number
  canvasHeight?: number
  layers?: unknown[]
  toolsCustomProps?: Array<{
    name: string
    customProps?: Record<string, unknown>
    versions?: Array<{ name: string; customProps?: Record<string, unknown> }>
  }>
  selectedTool?: { name: string; version: number | false } | false
  colors?: Array<{
    id: number
    initialHex: string
    brightness: number
    finalHex: string
  }>
  selectedColorId?: number
  layersSidebarExpanded?: boolean
  sceneGuides?: import('./guides/guideTypes').SceneGuidesSnapshot
  paper?: string
}

export const createInitialEditorState = (
  config: EditorConfig,
  defaultAltitudeFactor: number
): EditorState => ({
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
    tangentialPressure: 0,
    drewSomething: false,
    isNearRuler: false,
    isDown: false,
    isZooming: false,
    zoomDragChanged: false,
    altitudeAngle: config.defaultAltitudeAngle,
    altitudeFactor: defaultAltitudeFactor,
    azimuthAngle: 0,
    twist: 0,
    hasTwist: false,
    rotation: 0,
    pathRotation: 0,
    stepLength: 0,
    speedFactor: 0,
    timeStamp: 0,
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
    aspectRatio: 1,
  },
  lastAdaptedStep: {},
  lastLineAdaptationTimestamp: 0,
  stepsSinceLastLineAdaptation: 0,
  pxDistanceSinceLastLineAdaptation: 0,
  hasPredictedOverlay: false,
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
    transformKind: 'resize',
    x: -1,
    y: -1,
    w: -1,
    h: -1,
    r: 0,
    quad: null,
    warpMesh: null,
    startDragX: -1,
    startDragY: -1,
  },
  lassoMode: {
    active: false,
    isWand: false,
    captureInput: false,
    isDrawing: false,
    hasSelection: false,
    hasPixels: false,
    isMoveMode: false,
    isDraggingMove: false,
    inverted: false,
    points: [],
    rings: [],
    minX: -1,
    minY: -1,
    maxX: -1,
    maxY: -1,
  },
  quickShapeMode: {
    active: false,
    variant: '',
    availableVariants: [],
    minX: -1,
    minY: -1,
    maxX: -1,
    maxY: -1,
  },
  gradientMode: {
    active: false,
    kind: 'linear',
    color1: '#000000',
    color2: '#ffffff',
    initializedColors: false,
    hasActiveEdit: false,
    isDragging: false,
    draggingHandle: null,
    layerId: '',
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
  },
  pipette: {
    bg: 'none',
    isVisible: false,
    currentColor: false,
    isOnCanvas: false,
    context: null,
  },
  colorDrop: {
    active: false,
    fillHex: '',
  },
  currentLayerGCO: 'source-over',
  currentToolGCO: 'source-over',
  currentLayerIsActive: true,
  currentDeviceHasStylus: false,
  desktopCanvasPanMode: false,
  desktopPointerDown: false,
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
})
