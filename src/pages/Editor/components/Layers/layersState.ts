import { v4 as uuidv4 } from 'uuid'
import History from 'modules/History'
import * as Coworking from 'modules/Coworking'
import { getNewContextForCanvas, ExtendedCanvasContext } from 'utils/canvasUtils'
import { deepCopy } from 'utils/jsUtils'
import { LayersRefs } from './LayersView'
import type { TransformKind } from 'pages/Editor/editorTypes'
import type { QuadCorners, WarpMesh } from 'utils/imageWarp'
import type { LassoExtractionResult, LassoPoint } from './layerLasso'
import {
  MagnetismEntry,
  getMagnetismCoordXForLayer,
  getMagnetismCoordYForLayer,
  getMagnetismCoordLeftForLayer,
  getMagnetismCoordTopForLayer,
  getMagnetismCoordRightForLayer,
  getMagnetismCoordBottomForLayer,
} from './layersUtils'
import type { LayerBlendMode } from './layerBlendMode'
import type { AdjustmentFilterKind, AdjustmentSpec } from './layerAdjustmentTypes'

type LayerKind = 'pixel' | 'adjustment'

export const MAX_LAYER_NAME_LENGTH = 12
export const PREVIEW_SIZE = 300
export const EMPTY_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export const config = {
  maxConcurrentThreads: 8,
  stepHistoryMaxLength: 50 + 1,
  maxLayersNumber: 30,
  maxLayersNumberLowPerf: 20,
  maxLayersNumberMediumPerf: 30,
  maxLayersNumberHighPerf: 40,
  paramsCloseDelay: 7_000,
  coordsImgScale: 1,
}

export const labels = {
  areYouSureToDeleteLayer: 'Are you sure ?',
  changeLayerName: 'Insert new name for layer',
  areYouSureToSendLayer: 'Do you want to send this layer to your friend ?',
}

export type LayerCanvasElement = HTMLCanvasElement & {
  context: ExtendedCanvasContext
}

export type LayerPreviewCanvas = HTMLCanvasElement & {
  context: CanvasRenderingContext2D | null
}

export interface LayerHistoryStep {
  bitmap?: ImageBitmap
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface LayerRecord {
  id: string
  minX: number
  minY: number
  maxX: number
  maxY: number
  name: string
  order: number
  active: boolean
  canvas: LayerCanvasElement
  opacity: number
  blendMode: LayerBlendMode
  history: History<LayerHistoryStep>
  selected: boolean
  modified: boolean
  previewRef: LayerPreviewCanvas | null
  createTimestamp: number
  updateTimestamp: number
  owner: string
  base64?: string
  bitmap?: ImageBitmap
  maskBelowLayerId: string | null
  displayCanvas: LayerCanvasElement | null
  layerKind?: LayerKind
  adjustmentSpec?: AdjustmentSpec
}

export interface LayersMagnetismCoords {
  x: MagnetismEntry[]
  y: MagnetismEntry[]
  l: MagnetismEntry[]
  t: MagnetismEntry[]
  r: MagnetismEntry[]
  b: MagnetismEntry[]
}

export interface LayersState {
  layers: Record<string, LayerRecord>
  deletedLayers: Record<string, LayerRecord>
  currentSelectedLayerId: string | false
  canvasPanMode: boolean
  resizeMode: boolean
  adjustPanelOpen: boolean
  adjustBarMode: false | 'picker' | 'edit'
  /** After leaving edit, next tap on this manual filter on the picker turns it off. */
  adjustManualArmOff: AdjustmentFilterKind | false
  lassoMode: boolean
  lassoArmed: boolean
  wandMode: boolean
  lassoSelection: LassoExtractionResult | null
  lassoFloatDirty: boolean
  lassoFloatBasePoints: LassoPoint[] | null
  lassoFloatBaseRings: LassoPoint[][] | null
  lassoTransformPoints: LassoPoint[] | null
  lassoTransformOptions: { inverted: boolean; rings?: LassoPoint[][] } | null
  lassoHistoryDepth: number
  gcoMode: boolean
  editorIsUsingEraser: boolean
  paramsTimeout: ReturnType<typeof setTimeout> | false
  resizeModeMadeChanges: boolean
  listDragStartIndex: number
  canvases: {
    width: number
    height: number
  }
  magnetismCoords: LayersMagnetismCoords
  lastResizeCoords: {
    x: number
    y: number
    w: number
    h: number
    r: number
    transformKind: TransformKind
    quad: QuadCorners | null
    warpMesh: WarpMesh | null
    previewCoarse?: boolean
  }
}

const initialState: LayersState = {
  layers: {},
  deletedLayers: {},
  currentSelectedLayerId: false,
  canvasPanMode: false,
  resizeMode: false,
  adjustPanelOpen: false,
  adjustBarMode: false,
  adjustManualArmOff: false,
  lassoMode: false,
  lassoArmed: false,
  wandMode: false,
  lassoSelection: null,
  lassoFloatDirty: false,
  lassoFloatBasePoints: null,
  lassoFloatBaseRings: null,
  lassoTransformPoints: null,
  lassoTransformOptions: null,
  lassoHistoryDepth: 0,
  gcoMode: false,
  editorIsUsingEraser: false,
  paramsTimeout: false,
  resizeModeMadeChanges: false,
  listDragStartIndex: -1,
  canvases: {
    width: 0,
    height: 0,
  },
  magnetismCoords: {
    x: [],
    y: [],
    l: [],
    t: [],
    r: [],
    b: [],
  },
  lastResizeCoords: {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    r: 0,
    transformKind: 'resize',
    quad: null,
    warpMesh: null,
  },
}

export let state: LayersState = deepCopy(initialState)

let layersReady = false

export const markLayersReady = (ready: boolean) => {
  layersReady = ready
}

export const areLayersReady = () =>
  layersReady && state.canvases.width > 0 && state.canvases.height > 0

export const resetLayersState = () => {
  layersReady = false
  if (state?.lassoSelection) {
    state.lassoSelection.selectedCanvas.width = state.lassoSelection.selectedCanvas.height = 0
    state.lassoSelection.outsideCanvas.width = state.lassoSelection.outsideCanvas.height = 0
    state.lassoSelection = null
  }
  state = deepCopy(initialState)
}

export const refs: LayersRefs = {
  layersContainer: null,
  layersList: null,
  layerListElement: null,
  addNewLayerButton: null,
  paramsContainer: null,
  editLayerNameButton: null,
  duplicateLayerButton: null,
  mergeDownLayerButton: null,
  maskDownLayerButton: null,
  deleteLayerButton: null,
  flipVerticalButton: null,
  flipHorizontalButton: null,
  sendLayerButton: null,
  canvasPanButton: null,
  layersToggleButton: null,
  gcoButton: null,
  resizeButton: null,
  lassoButton: null,
  adjustParamsButton: null,
  visibilityLayerButton: null,
  imageForResize: null,
  resizeBaseSnapshot: null,
  resizeWarpSourcePixels: null,
  backgroundForResize: null,
  blendModeChip: null,
  opacitySlider: null,
  opacityCursor: null,
  opacityLabel: null,
}

export interface GlobalLayerHistoryAction {
  type: string
  layerId?: string
  newLayerId?: string
  layerOneId?: string
  layerTwoId?: string
  prevSelectedId?: string
  nextSelectedId?: string
  newValue?: number
  oldValue?: number
  newName?: string
  oldName?: string
  maskBelowLayerId?: string | null
  oldMaskBelowLayerId?: string | null
  partnerLayerId?: string
  blendModeNew?: LayerBlendMode
  blendModeOld?: LayerBlendMode
  adjustTargetLayerId?: string
  adjustBeforeJson?: string | null
  adjustAfterJson?: string | null
}

export let UsersLayersHistory: Record<string, History<GlobalLayerHistoryAction>> = {}

export const clearUsersLayersHistory = () => {
  Object.values(UsersLayersHistory).forEach((userHistory) => userHistory.clear())
  UsersLayersHistory = {}
}

export const initHistories = (coworkersId: string[] = []) => {
  const usersId = [Coworking.getUserId(), ...coworkersId.filter(Boolean)]
  const maxHistorySteps = Math.trunc(config.stepHistoryMaxLength / usersId.length) + 1

  UsersLayersHistory = Object.fromEntries(
    usersId.map((userId) => {
      const userHistory = new History<GlobalLayerHistoryAction>(maxHistorySteps)
      userHistory.add({
        type: 'init',
      })
      return [userId, userHistory]
    })
  )
}

export const clearLayerHistoryStepBitmap = (step?: LayerHistoryStep) => {
  if (step?.bitmap) {
    step.bitmap.close()
    delete step.bitmap
  }
}

export const hardDeleteLayer = (layerId: string, clearHistory = true) => {
  const layer = state.layers?.[layerId] || state.deletedLayers?.[layerId]
  if (layer) {
    if (clearHistory && layer.history) {
      layer.history.clear()
      ;(layer as { history?: unknown }).history = undefined
    }
    if (layer.displayCanvas) {
      layer.displayCanvas.remove()
      layer.displayCanvas.width = layer.displayCanvas.height = 0
      ;(layer as { displayCanvas?: unknown }).displayCanvas = null
    }
    if (layer.canvas) {
      layer.canvas.remove()
      layer.canvas.width = layer.canvas.height = 0
      ;(layer as { canvas?: unknown }).canvas = undefined
    }

    if (state.layers) delete state.layers[layerId]
    if (state.deletedLayers) delete state.deletedLayers[layerId]
  }
}

export const layerCanBeResized = (layerId: string): boolean =>
  Boolean(
    state.layers[layerId]?.active &&
    Number.isFinite(state.layers[layerId].minX) &&
    state.layers[layerId].opacity > 0
  )

export const layerCanUseLasso = (layerId: string): boolean =>
  Boolean(state.layers[layerId]?.active && state.layers[layerId].opacity > 0)

export const findAdjustmentForTarget = (targetLayerId: string): LayerRecord | undefined =>
  Object.values(state.layers).find(
    (l) => l.layerKind === 'adjustment' && l.maskBelowLayerId === targetLayerId
  )

export const layerCanUseAdjust = (layerId: string): boolean => {
  const layer = state.layers[layerId]
  if (!layer || layer.layerKind === 'adjustment') return false
  if (!Number.isFinite(layer.minX)) return false
  if (findAdjustmentForTarget(layerId)) return false
  return Boolean(layer.active && layer.opacity > 0)
}

export const getCurrentSelectedLayerId = (): string => state.currentSelectedLayerId || ''

export const getLayerContext = (
  layerId: string | false = state.currentSelectedLayerId
): ExtendedCanvasContext => state.layers[layerId || '']?.canvas?.context

export const isYourLayerYours = (layerId: string): boolean =>
  state.layers[layerId]?.owner === Coworking.getUserId()

export const filterYoursLayers = (): LayerRecord[] =>
  Object.values(state.layers).filter((l) => l.owner === Coworking.getUserId())

export const findFirstLayerForUser = (userId = Coworking.getUserId()): string =>
  Object.values(state.layers)
    .filter((l) => l.owner === userId)
    .sort((a, b) => b.order - a.order)[0]?.id || ''

export const findSelectedLayerIdForUser = (userId: string): string => {
  let result = Object.values(state.layers).find(
    (layer) => layer.owner === userId && layer.selected
  )?.id

  if (!result) {
    result = Object.values(state.layers).find((layer) => layer.owner === userId)?.id
  }

  return result || ''
}

export const isYourLayerEmpty = (
  layerId: string | false = state.currentSelectedLayerId
): boolean => {
  const layer = state.layers?.[layerId || '']
  if (!layer) return true
  return (
    Number.isFinite(layer.maxX) === false ||
    layer.minX === null ||
    layer.maxX === null ||
    layer.minY === null ||
    layer.maxY === null
  )
}

export const getNextLayerName = (): string => {
  const existingNames = new Set(Object.values(state.layers).map((l) => l.name))
  let index = Object.keys(state.layers).length + 1
  while (existingNames.has(`Layer ${index}`)) {
    index++
  }
  return `Layer ${index}`
}

const getMaxOrder = (): number => {
  const max = Math.max(...Object.values(state.layers).map((l) => l.order))
  return isFinite(max) ? max : 0
}

export const createNewLayerCanvas = (): LayerCanvasElement => {
  const canvas = document.createElement('canvas') as LayerCanvasElement
  canvas.width = state.canvases.width
  canvas.height = state.canvases.height
  canvas.context = getNewContextForCanvas(canvas)
  return canvas
}

export const createNewLayerData = (owner: string | false = false): LayerRecord => ({
  id: uuidv4(),
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
  name: getNextLayerName(),
  order: getMaxOrder() + 1,
  active: true,
  canvas: null as unknown as LayerCanvasElement,
  opacity: 1,
  blendMode: 'normal',
  history: new History<LayerHistoryStep>(config.stepHistoryMaxLength, clearLayerHistoryStepBitmap),
  selected: false,
  modified: false,
  previewRef: null,
  createTimestamp: Date.now(),
  updateTimestamp: Date.now(),
  owner: owner || Coworking.getUserId(),
  maskBelowLayerId: null,
  displayCanvas: null,
  layerKind: 'pixel',
})

export const setLayerCoordsAfterDragResize = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
) => {
  if (!state.currentSelectedLayerId || !state.layers[state.currentSelectedLayerId]) return
  const current = state.layers[state.currentSelectedLayerId]
  if (refs.backgroundForResize && Number.isFinite(current.minX)) {
    state.layers[state.currentSelectedLayerId] = {
      ...current,
      minX: Math.min(current.minX, minX),
      minY: Math.min(current.minY, minY),
      maxX: Math.max(current.maxX, maxX),
      maxY: Math.max(current.maxY, maxY),
    }
    return
  }
  state.layers[state.currentSelectedLayerId] = {
    ...current,
    minX,
    minY,
    maxX,
    maxY,
  }
}

export const updateMagnetismCoords = (
  layerId: string | false = state.currentSelectedLayerId,
  hasRotation = false
) => {
  if (!layerId) return
  state.magnetismCoords.x = getMagnetismCoordXForLayer(state, layerId, hasRotation)
  state.magnetismCoords.y = getMagnetismCoordYForLayer(state, layerId, hasRotation)
  if (hasRotation) {
    state.magnetismCoords.l =
      state.magnetismCoords.t =
      state.magnetismCoords.r =
      state.magnetismCoords.b =
        []
  } else {
    state.magnetismCoords.l = getMagnetismCoordLeftForLayer(state, layerId)
    state.magnetismCoords.t = getMagnetismCoordTopForLayer(state, layerId)
    state.magnetismCoords.r = getMagnetismCoordRightForLayer(state, layerId)
    state.magnetismCoords.b = getMagnetismCoordBottomForLayer(state, layerId)
  }
}

export const getMagnetismCoords = () => state.magnetismCoords
