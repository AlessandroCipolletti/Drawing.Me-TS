import Params from 'main/Params'
import History from 'modules/History'
import * as Coworking from 'modules/Coworking'
import { editorFacade } from 'pages/Editor/editorFacade'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import { addInElement } from 'utils/animationsUtils'
import { round } from 'utils/mathUtils'
import {
  getImgBase64OffThread,
  cropImageWithMargin,
  resizeImage,
  findImageContentCoords,
  duplicateCanvas,
  getCanvasFromBase64,
} from 'utils/imageUtils'
import { getNewContextForCanvas } from 'utils/canvasUtils'
import { parallelize } from 'utils/jsUtils'
import {
  EMPTY_BASE64,
  PREVIEW_SIZE,
  config,
  state,
  refs,
  clearLayerHistoryStepBitmap,
  isYourLayerEmpty,
  isYourLayerYours,
  LayerCanvasElement,
  LayerHistoryStep,
  LayerPreviewCanvas,
  LayerRecord,
} from './layersState'
import { layersBridge, registerLayersBridge } from './layersBridge'
import {
  ensureLayerDisplayCanvas,
  getLayerDomCanvas,
  syncLayerDisplay,
  validateAllMaskAdjacency,
} from './layerMask'
import {
  applyBlendModeToDomCanvas,
  compositeLayerOntoContext,
  normalizeBlendMode,
} from './layerBlendMode'

export interface ExportableLayerCopy {
  id: string
  minX: number
  minY: number
  maxX: number
  maxY: number
  name: string
  order: number
  active: boolean
  opacity: number
  blendMode?: string
  modified?: boolean
  selected: boolean
  createTimestamp: number
  updateTimestamp: number
  owner?: string
  canvas?: LayerCanvasElement
  bitmap?: ImageBitmap
  base64?: string
  resizeMode?: unknown
  gco?: unknown
  maskBelowLayerId?: string | null
  layerKind?: string
  adjustmentSpec?: unknown
}

const layerDeepCopy = (
  layer: LayerRecord,
  {
    exportBitmap = false,
    deepCopyCanvas = true,
    usingOffscreen = false,
  }: { exportBitmap?: boolean; deepCopyCanvas?: boolean; usingOffscreen?: boolean } = {}
): ExportableLayerCopy => {
  const copy: ExportableLayerCopy = {
    id: layer.id,
    minX: layer.minX,
    minY: layer.minY,
    maxX: layer.maxX,
    maxY: layer.maxY,
    name: layer.name,
    order: layer.order,
    active: layer.active,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    modified: layer.modified,
    selected: layer.selected,
    createTimestamp: layer.createTimestamp,
    updateTimestamp: layer.updateTimestamp,
    owner: layer.owner,
    maskBelowLayerId: layer.maskBelowLayerId ?? null,
    layerKind: layer.layerKind ?? 'pixel',
    adjustmentSpec: layer.adjustmentSpec
      ? JSON.parse(JSON.stringify(layer.adjustmentSpec))
      : undefined,
  }
  if (deepCopyCanvas) {
    const source = layer.layerKind === 'adjustment' ? getLayerDomCanvas(layer) : layer.canvas
    copy.canvas = duplicateCanvas(source, usingOffscreen) as unknown as LayerCanvasElement
  }
  if (exportBitmap) {
    copy.bitmap = layer.history.getCurrent()?.bitmap
  }
  return copy
}

const prepareLayerDataToExport = async (layer: ExportableLayerCopy) => {
  if (layer.bitmap) {
    layer.base64 = await getImgBase64OffThread(layer.bitmap)
  } else if (layer.canvas) {
    const bitmap = await createImageBitmap(layer.canvas)
    layer.base64 = await getImgBase64OffThread(bitmap)
    bitmap.close()
  }
  delete layer.owner
  delete layer.resizeMode
  delete layer.modified
  delete layer.canvas
  delete layer.bitmap
  delete layer.gco
  return layer
}

export const exportLayers = async ({
  exportJustModifiedLayers = true,
  cleanMemoryAfterwards = false,
}: { exportJustModifiedLayers?: boolean; cleanMemoryAfterwards?: boolean } = {}) => {
  const currentLayers = Object.values(state.layers || {})
  const layers = currentLayers
    .filter((layer) => !isYourLayerEmpty(layer.id))
    .sort((l1, l2) => (l1.order > l2.order ? 1 : -1))
    .map((l) =>
      layerDeepCopy(l, {
        exportBitmap: !exportJustModifiedLayers || l.modified,
        deepCopyCanvas: false,
      })
    )

  for (const layer of currentLayers) {
    layer.modified = false
  }

  const layerData = await parallelize(layers, prepareLayerDataToExport, config.maxConcurrentThreads)

  if (cleanMemoryAfterwards) {
    currentLayers.forEach((layer) => {
      layer.history?.clear()
      ;(layer as { history?: unknown }).history = undefined
    })
  }

  return layerData
}

export interface WholeCanvasExport {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  canvasWidth: number
  canvasHeight: number
  base64: string
  context?: OffscreenCanvasRenderingContext2D | null
}

export const exportWholeCanvasData = async (
  returnCanvasContext = false
): Promise<WholeCanvasExport> => {
  const tempCanvas = new OffscreenCanvas(state.canvases.width, state.canvases.height)
  const tempContext = tempCanvas.getContext('2d', {
    willReadFrequently: true,
  }) as OffscreenCanvasRenderingContext2D | null
  const data: WholeCanvasExport = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    width: 0,
    height: 0,
    canvasWidth: state.canvases.width,
    canvasHeight: state.canvases.height,
    base64: EMPTY_BASE64,
  }

  const layers = Object.values(state.layers).sort((l1, l2) => (l1.order > l2.order ? 1 : -1))
  for (const layer of layers) {
    if (layer.active && tempContext) {
      if (layer.layerKind === 'adjustment' && layer.adjustmentSpec) {
        const { renderAndCompositeAdjustment } = await import('./layerAdjustmentRender')
        await renderAndCompositeAdjustment(layer.id, 'full')
      } else {
        syncLayerDisplay(layer.id)
      }
      compositeLayerOntoContext(
        tempContext,
        getLayerDomCanvas(layer),
        layer.opacity,
        layer.blendMode
      )
      data.minX = Math.min(data.minX, layer.minX)
      data.minY = Math.min(data.minY, layer.minY)
      data.maxX = Math.max(data.maxX, layer.maxX)
      data.maxY = Math.max(data.maxY, layer.maxY)
    }
  }
  data.width = round(data.maxX - data.minX, 0)
  data.height = round(data.maxY - data.minY, 0)

  let bitmap: ImageBitmap | null = null
  if (returnCanvasContext) {
    if (Number.isFinite(data.minX)) {
      bitmap = await createImageBitmap(tempCanvas)
      data.base64 = await getImgBase64OffThread(bitmap)
    }
    data.context = tempContext
  } else {
    if (Number.isFinite(data.minX)) {
      const [cropped] = cropImageWithMargin(tempCanvas, data.minX, data.minY, data.maxX, data.maxY)
      bitmap = await createImageBitmap(cropped)
      data.base64 = await getImgBase64OffThread(bitmap)
    }
    tempCanvas.width = tempCanvas.height = 0
  }

  if (bitmap) {
    bitmap.close()
  }

  return data
}

const prepareLayerFromDb = async (rawLayer: LayerRecord & { base64: string }) => {
  const layer = layerDeepCopy(rawLayer, { deepCopyCanvas: false }) as unknown as LayerRecord
  layer.modified = false
  layer.owner = Coworking.getUserId()
  layer.canvas = (await getCanvasFromBase64(rawLayer.base64)) as LayerCanvasElement
  layer.canvas.context = getNewContextForCanvas(layer.canvas)
  layer.history = new History<LayerHistoryStep>(
    config.stepHistoryMaxLength,
    clearLayerHistoryStepBitmap
  )
  layer.maskBelowLayerId = rawLayer.maskBelowLayerId ?? null
  layer.blendMode = normalizeBlendMode(rawLayer.blendMode)
  layer.layerKind = rawLayer.layerKind ?? 'pixel'
  layer.adjustmentSpec = rawLayer.adjustmentSpec as LayerRecord['adjustmentSpec']
  layer.displayCanvas = null
  ensureLayerDisplayCanvas(layer)
  syncLayerDisplay(layer.id)
  return layer
}

const updateLayerRealCoords = async (layerId: string | false = state.currentSelectedLayerId) => {
  if (!layerId || !state.layers[layerId]) return
  state.layers[layerId] = {
    ...state.layers[layerId],
    ...(await findImageContentCoords(state.layers[layerId].canvas, config.coordsImgScale)),
  }
}

const updateLayerPreview = (layerId: string | false = state.currentSelectedLayerId) => {
  const layer = state.layers[layerId || '']
  if (!layer || !layer.previewRef || !layer.previewRef.context) return

  if (Number.isFinite(layer.minX)) {
    syncLayerDisplay(layer.id)
    const previewSource = getLayerDomCanvas(layer)
    let [preview] = cropImageWithMargin(
      previewSource,
      layer.minX,
      layer.minY,
      layer.maxX,
      layer.maxY
    )
    preview = resizeImage(preview, PREVIEW_SIZE)
    layer.previewRef.width = preview.width
    layer.previewRef.height = preview.height
    layer.previewRef.context.drawImage(preview, 0, 0)
  } else {
    layer.previewRef.context.clearRect(0, 0, layer.previewRef.width, layer.previewRef.height)
  }
}

const createNewLayerListElementDom = (layerId: string, withAnimation = true) => {
  if (!refs.layerListElement || !refs.layersList) return
  const layerListDom = refs.layerListElement.cloneNode(true) as HTMLElement
  layerListDom.setAttribute('data-id', layerId)
  const previewCanvas = layerListDom.querySelector(
    '.editor-layers__layer-preview'
  ) as LayerPreviewCanvas
  previewCanvas.context = previewCanvas.getContext('2d')
  state.layers[layerId].previewRef = previewCanvas
  layerListDom.classList.toggle(
    'editor-layers__layer-selected',
    Boolean(state.layers[layerId].selected)
  )
  layerListDom.classList.toggle('editor-layers__layer-yours', isYourLayerYours(layerId))
  layerListDom.classList.toggle('editor-layers__layer-coworker', !isYourLayerYours(layerId))
  const input = layerListDom.querySelector('input') as HTMLInputElement | null
  if (input) {
    input.value = state.layers[layerId].name
    input.addEventListener(Params.eventStart, (e) => {
      e.preventDefault()
    })
  }
  layerListDom
    .querySelector('.editor-layers__layer-options-button')
    ?.classList.toggle('svg-icon-visible', !isYourLayerYours(layerId))

  refs.layersList.appendChild(layerListDom)
  if (withAnimation) {
    addInElement(layerListDom, { commitResult: false })
  }
  layersBridge.updateLayerListMaskAffordances()
}

const createNewLayerDom = async (layerId: string, withAnimation = false) => {
  createNewLayerListElementDom(layerId, withAnimation)
  const layer = state.layers[layerId]

  ensureLayerDisplayCanvas(layer)
  syncLayerDisplay(layerId)
  const domCanvas = getLayerDomCanvas(layer)
  domCanvas.style.zIndex = String(layer.order * 10)
  domCanvas.style.opacity = String(layer.opacity)
  applyBlendModeToDomCanvas(domCanvas, layer.blendMode)

  if (state.layers[layerId].active) {
    layersBridge.enableLayer(layerId)
  } else {
    layersBridge.disableLayer(layerId)
  }

  updateLayerPreview(layerId)
  editorFacade.appendLayer(domCanvas)

  if (layer.canvas.width > 0 && layer.canvas.height > 0) {
    layer.history.add({
      bitmap: await createImageBitmap(layer.canvas),
      minX: layer.minX,
      minY: layer.minY,
      maxX: layer.maxX,
      maxY: layer.maxY,
    })
  }
}

const reorderLayersList = () => {
  Object.values(state.layers)
    .sort((l1, l2) => (l1.order > l2.order ? 1 : -1))
    .forEach((layer, i) => {
      layer.order = i
      getLayerDomCanvas(layer).style.zIndex = String(i * 10)
    })

  const layersCount = Object.keys(state.layers).length
  removeGlobalStatus('drawith__LAYERS_FULL')
  removeGlobalStatus('drawith__LAYERS_EMPTY')
  if (layersCount === config.maxLayersNumber) {
    addGlobalStatus('drawith__LAYERS_FULL')
  } else if (layersCount === 1) {
    addGlobalStatus('drawith__LAYERS_EMPTY')
  }

  if (refs.layersList) {
    Array.from(refs.layersList.children)
      .filter((l) => Boolean(state.layers[l.getAttribute('data-id') || '']))
      .sort((l1, l2) =>
        state.layers[l1.getAttribute('data-id') || ''].order <
        state.layers[l2.getAttribute('data-id') || ''].order
          ? 1
          : -1
      )
      .forEach((node) => refs.layersList?.appendChild(node))
  }
  validateAllMaskAdjacency()
  layersBridge.updateLayerListMaskAffordances()
  layersBridge.updateEditorCanvas()
}

const restoreDeletedLayer = async (layerId: string, withAnimation = true) => {
  const layer = state.deletedLayers[layerId]
  if (!layer) return
  Object.values(state.layers).forEach((l) => {
    if (l.order >= layer.order) {
      l.order++
    }
  })
  state.layers[layerId] = layer
  delete state.deletedLayers[layerId]

  createNewLayerListElementDom(layerId, withAnimation)
  reorderLayersList()
  ensureLayerDisplayCanvas(layer)
  syncLayerDisplay(layerId)
  const domCanvas = getLayerDomCanvas(layer)
  domCanvas.style.zIndex = String(layer.order * 10)
  domCanvas.style.opacity = String(layer.opacity)
  applyBlendModeToDomCanvas(domCanvas, layer.blendMode)

  if (state.layers[layerId].active) {
    layersBridge.enableLayer(layerId)
  } else {
    layersBridge.disableLayer(layerId)
  }

  editorFacade.appendLayer(domCanvas)
  await updateLayerPreview(layerId)
}

registerLayersBridge({
  createNewLayerDom,
  layerDeepCopy,
  prepareLayerFromDb,
  reorderLayersList,
  updateLayerPreview,
  updateLayerRealCoords,
  restoreDeletedLayer,
})
