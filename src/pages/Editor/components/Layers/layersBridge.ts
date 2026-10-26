import type { LayerRecord } from './layersState'

export interface LayersBridge {
  createNewLayerDom: (layerId: string, withAnimation?: boolean) => Promise<void>
  layerDeepCopy: (
    layer: LayerRecord,
    options?: { exportBitmap?: boolean; deepCopyCanvas?: boolean; usingOffscreen?: boolean }
  ) => unknown
  prepareLayerFromDb: (rawLayer: LayerRecord & { base64: string }) => Promise<LayerRecord>
  reorderLayersList: () => void
  updateLayerPreview: (layerId?: string | false) => void
  updateLayerRealCoords: (layerId?: string | false) => Promise<void>
  addLayerHistoryContentChangedStep: (layerId?: string | false) => Promise<void>
  addLayerHistoryDeleteStep: (layerId: string, nextSelectedId: string) => Promise<void>
  addLayerHistoryDisableStep: (layerId: string) => Promise<void>
  addLayerHistoryDuplicateStep: (layerId: string, newLayerId: string) => Promise<void>
  addLayerHistoryEnableStep: (layerId: string) => Promise<void>
  addLayerHistoryMergeStep: (
    layerOneId: string,
    layerTwoId: string,
    newLayerId: string
  ) => Promise<void>
  addLayerHistoryNewStep: (layerId: string) => Promise<void>
  addLayerHistoryRenameStep: (layerId: string, newName: string, oldName: string) => Promise<void>
  addLayerHistoryOpacityStep: (layerId: string, newValue: number, oldValue: number) => Promise<void>
  addLayerHistoryOrderStep: (
    layerId: string,
    newValue: number,
    oldValue: number,
    partnerLayerId?: string
  ) => Promise<void>
  placeMaskGroupAtUpperOrder: (upperId: string, lowerId: string, upperOrder: number) => void
  addLayerHistoryMaskStep: (
    layerId: string,
    maskBelowLayerId: string | null,
    oldMaskBelowLayerId: string | null
  ) => Promise<void>
  addLayerHistoryCutToNewStep: (sourceLayerId: string, newLayerId: string) => Promise<void>
  commitLayerCanvasStepOnly: (layerId: string) => Promise<void>
  applyLayerMaskLink: (
    layerId: string,
    maskBelowLayerId: string | null,
    recordHistory?: boolean,
    bakeOnUnmask?: boolean
  ) => Promise<void>
  updateLayerListMaskAffordances: () => void
  updateUndoRedoButtons: () => void
  cleanGlobalLayersHistoryForLayer: (layerId: string) => void
  closeParams: () => Promise<void>
  endResizeMode: () => Promise<void>
  endLassoMode: () => void
  openParams: () => Promise<void>
  paramsAreClosed: () => boolean
  saveResizeModeIfNeeded: () => Promise<void>
  startResizeMode: () => void
  updateEditorCanvas: () => void
  updateGcoMode: (selected: boolean, active: boolean) => void
  updateParamsByLayer: (layerId?: string | false) => void
  updateResizeMode: (selected: boolean, active: boolean) => void
  updateLassoMode: (selected: boolean, active: boolean) => void
  selectCoworkerLayer: (layerId: string) => void
  _deleteLayer: (
    layerId: string,
    nextSelectedId?: string | 0,
    withAnimation?: boolean
  ) => Promise<void>
  clearLayer: (layerId: string) => void
  disableLayer: (layerId?: string | false) => void
  duplicateLayer: (layerId: string, newId: string) => Promise<void>
  enableLayer: (layerId?: string | false) => void
  mergeLayers: (
    layerOneId: string,
    layerTwoId: string,
    newLayerId: string,
    ownerId?: string
  ) => Promise<void>
  saveLayerName: (layerId: string, newName: string) => void
  selectLayer: (layerId: string) => Promise<void>
  updateLayerOrger: (layerId: string, newOrder: number) => void
  restoreDeletedLayer: (layerId: string, withAnimation?: boolean) => Promise<void>
  createLayerFromSelectionCanvas: (
    newLayerId: string,
    insertOrder: number,
    selectedCanvas: HTMLCanvasElement | OffscreenCanvas,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    ownerId?: string,
    layerName?: string
  ) => Promise<LayerRecord>
  _updateLayerOpacity: (layerId: string, opacity: number, inProgress?: boolean) => void
  toggleEnableLayer: (e?: Event, layerId?: string | false, clickedByList?: boolean) => void
}

export const layersBridge = {} as LayersBridge

export const registerLayersBridge = (part: Partial<LayersBridge>) => {
  Object.assign(layersBridge, part)
}
