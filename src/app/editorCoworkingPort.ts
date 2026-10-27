import type { CoworkingStepsPayload } from 'pages/Editor/editorTypes'

export interface CoworkerLayerPayload {
  id: string
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface EditorCoworkingPort {
  getCanvasPxSizes: (withCoworking?: boolean) => [number, number]
  drawCoworkingMultipleStepsData: (data: CoworkingStepsPayload) => void
  areLayersReady: () => boolean
  addNewLayerFromCoworker: (layer: CoworkerLayerPayload) => Promise<void>
  selectCoworkerLayer: (layerId: string) => void
  doUndoForUser: (userId: string) => Promise<unknown>
  doRedoForUser: (userId: string) => Promise<unknown>
  deleteLayerFromCoworker: (layerId: string, nextSelectedId: string) => void
  renameLayerFromCoworker: (layerId: string, newName: string) => void
  duplicateLayerFromCoworker: (layerId: string, newId: string) => void
  mergeLayersFromCoworker: (layerOneId: string, layerTwoId: string, newLayerId: string) => void
  receiveLassoClearFromCoworker: (
    layerId: string,
    points: Array<[number, number]>,
    inverted?: boolean,
    rings?: Array<Array<[number, number]>>
  ) => Promise<void>
  receiveLassoTransformFromCoworker: (
    layerId: string,
    points: Array<[number, number]>,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    inverted?: boolean,
    rings?: Array<Array<[number, number]>>
  ) => Promise<void>
  receiveLassoCopyToLayerFromCoworker: (
    sourceLayerId: string,
    newLayerId: string,
    insertOrder: number,
    layerName: string,
    points: Array<[number, number]>,
    inverted?: boolean,
    rings?: Array<Array<[number, number]>>
  ) => Promise<void>
  receiveLassoCutToLayerFromCoworker: (
    sourceLayerId: string,
    newLayerId: string,
    insertOrder: number,
    layerName: string,
    points: Array<[number, number]>,
    inverted?: boolean,
    rings?: Array<Array<[number, number]>>
  ) => Promise<void>
  receiveLayerMaskFromCoworker: (
    layerId: string,
    maskBelowLayerId: string | null,
    oldMaskBelowLayerId: string | null
  ) => void
  updateLayerOpacityFromCoworker: (layerId: string, opacity: number, oldValue: number) => void
  updateLayerBlendModeFromCoworker: (
    layerId: string,
    blendModeNew: string,
    blendModeOld: string
  ) => void
  enableLayerFromCoworker: (layerId: string) => void
  disableLayerFromCoworker: (layerId: string) => void
  layerDragChangeFromCoworker: (
    layerId: string,
    newOrder: number,
    oldOrder: number,
    partnerLayerId?: string
  ) => void
  receiveFlipLayerFromCoworker: (layerId: string, horizontally: boolean) => void
  receiveResizeLayerFromCoworker: (
    layerId: string,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => void
  clearLayerFromCoworker: (layerId: string) => void
  receiveLayerFromCoworker: (layerId: string) => void
  applySceneGuidesFromCoworker?: (guides: unknown) => void
}

export const editorCoworkingPort = {} as EditorCoworkingPort

export const registerEditorCoworkingPort = (part: Partial<EditorCoworkingPort>) => {
  Object.assign(editorCoworkingPort, part)
}
