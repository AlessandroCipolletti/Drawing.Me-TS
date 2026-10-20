import Dexie, { Table } from 'dexie'
import Params from 'main/Params'
import { securizeAsyncFn } from 'utils/jsUtils'
import { mergeUnchangedLayers } from 'pages/Editor/components/Layers/layersUtils'
import * as GPS from 'pages/Dashboard/modules/GPS'

const DEFAULT_LOCAL_DB_ERROR_MSG = 'Db Error: refresh the page.'
const DRAWING_STATE_SAVING_DRAFT_LOCALLY = 1
const DRAWING_STATE_DRAFT_SAVED_LOCALLY = 2
export const DRAWING_STATE_SAVING_LOCALLY = 3
export const DRAWING_STATE_SAVED_LOCALLY = 4

const backgroundSavingIds = new Set<number>()

export const setBackgroundSavingId = (id: number | false | undefined, saving: boolean) => {
  if (!id) return
  if (saving) {
    backgroundSavingIds.add(Number(id))
  } else {
    backgroundSavingIds.delete(Number(id))
  }
}

export const drawingIsSaving = (drawing: any): boolean => {
  if (!drawing) return false
  return (
    drawing.state === DRAWING_STATE_SAVING_DRAFT_LOCALLY ||
    drawing.state === DRAWING_STATE_SAVING_LOCALLY ||
    backgroundSavingIds.has(Number(drawing.localDbId))
  )
}

class DrawingMeDatabase extends Dexie {
  Drawings!: Table<Record<string, any>, number>
  AppData!: Table<Record<string, any>, number>
}

let LocalDatabase: DrawingMeDatabase

const ensureDb = (): DrawingMeDatabase => {
  if (!LocalDatabase) {
    LocalDatabase = new DrawingMeDatabase(Params.localDbName || 'drawing_me_ts_DB')
    LocalDatabase.version(1).stores({
      Drawings:
        '++localDbId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, base64, bitmap, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, selectedColorId, colors, layers, appVersions, toolsCustomProps',
      AppData: '++id, coworkerWaitingId',
    })
  }
  return LocalDatabase
}

export const initLocalDb = securizeAsyncFn(
  async () => {
    const db = ensureDb()
    const appDataCount = await db.AppData.count()
    if (appDataCount === 0) {
      await db.AppData.add({ id: 1, coworkerWaitingId: false })
    }
    await deleteUnsavedDrawings()

    return true
  },
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'initLocalDb'
)

export const addCoworkerWaitingId = securizeAsyncFn(
  async (coworkerWaitingId: string) => {
    const db = ensureDb()
    const first = (await db.AppData.toArray())[0]
    if (first?.id) {
      await db.AppData.where('id').equals(first.id).modify({ coworkerWaitingId })
    } else {
      await db.AppData.add({ id: 1, coworkerWaitingId })
    }
  },
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'addCoworkerWaitingId'
)

export const getCoworkerWaitingId = securizeAsyncFn(
  async (): Promise<string | false> => {
    const first = (await ensureDb().AppData.toArray())[0]
    return first?.coworkerWaitingId || false
  },
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'getCoworkerWaitingId'
)

export const cleanCoworkerWaitingId = securizeAsyncFn(
  async () => {
    const db = ensureDb()
    const first = (await db.AppData.toArray())[0]
    if (first?.id) {
      await db.AppData.where('id').equals(first.id).modify({ coworkerWaitingId: false })
    }
  },
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'cleanCoworkerWaitingId'
)

export const deleteLocalDrawings = securizeAsyncFn(
  async (ids: number[] = []) => await ensureDb().Drawings.where('localDbId').anyOf(ids).delete(),
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'deleteLocalDrawings'
)

const deleteUnsavedDrawings = securizeAsyncFn(
  async () =>
    await ensureDb()
      .Drawings.where('state')
      .equals(DRAWING_STATE_SAVING_DRAFT_LOCALLY)
      .or('state')
      .equals(DRAWING_STATE_SAVING_LOCALLY)
      .delete(),
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'deleteUnsavedDrawings'
)

export const getAllLocalDrawings = securizeAsyncFn(
  async () => await ensureDb().Drawings.orderBy('updateTimestamp').reverse().toArray(),
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'getAllLocalDrawings'
)

export const getOneDrawing = securizeAsyncFn(
  async (localDbId: number) => await ensureDb().Drawings.get(Number(localDbId)),
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'getOneDrawing'
)

export const getSomeDrawings = securizeAsyncFn(
  async (ids: number[] = []) => await ensureDb().Drawings.bulkGet(ids.map(Number)),
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'getSomeDrawings'
)

const updateLocalDrawing = securizeAsyncFn(
  async (localDbId: number, drawing: Record<string, any>) =>
    await ensureDb().Drawings.where('localDbId').equals(Number(localDbId)).modify(drawing),
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'updateLocalDrawing'
)

const addLocalDrawing = securizeAsyncFn(
  async (drawing: Record<string, any>) => await ensureDb().Drawings.add(drawing),
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'addLocalDrawing'
)

const updateDrawing = securizeAsyncFn(
  async (drawing: Record<string, any>) => {
    const oldDrawing: any = await getOneDrawing(drawing.localDbId)
    const appVersions = oldDrawing?.appVersions || []
    if (!appVersions.includes(Params.appVersion)) {
      appVersions.push(Params.appVersion)
    }
    drawing.createTimestamp = oldDrawing?.createTimestamp || Date.now()
    drawing.appVersions = appVersions
    drawing.updateTimestamp = Date.now()
    if (oldDrawing?.gpsCoordinates && !drawing.gpsCoordinates) {
      drawing.gpsCoordinates = oldDrawing.gpsCoordinates
    }
    if (oldDrawing?.dashboardCoordinates && !drawing.dashboardCoordinates) {
      drawing.dashboardCoordinates = oldDrawing.dashboardCoordinates
    }
    await updateLocalDrawing(drawing.localDbId, drawing)
  },
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'updateDrawing'
)

const addDrawing = securizeAsyncFn(
  async (drawing: Record<string, any>) => {
    const now = Date.now()
    drawing.createTimestamp = now
    drawing.updateTimestamp = now
    drawing.appVersions = [Params.appVersion]
    if ((!drawing.gpsCoordinates || !drawing.dashboardCoordinates) && GPS.hasFix()) {
      const pos = GPS.getCurrentCoordinates()
      if (pos.x !== 0 || pos.y !== 0 || pos.lat !== 0 || pos.lon !== 0) {
        const px4mm = GPS.getPx4Mm()
        const [x, y] = GPS.coordGps2px(pos.lat, pos.lon)
        drawing.gpsCoordinates = {
          lat: pos.lat,
          lon: pos.lon,
          accuracy: pos.accuracy,
        }
        drawing.dashboardCoordinates = {
          x,
          y,
          px4mm,
        }
      }
    }
    drawing.localDbId = await addLocalDrawing(drawing)
    return drawing.localDbId
  },
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'addDrawing'
)

export const saveDrawingToDB = securizeAsyncFn(
  async (drawingInput: Record<string, any>, isDraft = false) => {
    const drawing: Record<string, any> = { ...drawingInput }
    let id = drawing.localDbId
    const existingDrawing = Boolean(id) && (await getOneDrawing(id))
    drawing.wasSavedAsDraft = isDraft

    const hasExportedLayers = Array.isArray(drawing.layers) && drawing.layers.length > 0

    if (isDraft) {
      if (hasExportedLayers) {
        drawing.state = DRAWING_STATE_DRAFT_SAVED_LOCALLY
      } else {
        drawing.state = DRAWING_STATE_SAVING_DRAFT_LOCALLY
      }
    } else {
      if (hasExportedLayers) {
        drawing.state = DRAWING_STATE_SAVED_LOCALLY
      } else {
        drawing.state = DRAWING_STATE_SAVING_LOCALLY
      }
    }

    if (existingDrawing) {
      if (hasExportedLayers) {
        drawing.layers = mergeUnchangedLayers(drawing.layers, (existingDrawing as any).layers || [])
      } else {
        drawing.layers = (existingDrawing as any).layers || []
      }
      await updateDrawing(drawing)
    } else {
      delete drawing.localDbId
      id = await addDrawing(drawing)
      drawingInput.localDbId = id
    }

    drawingInput.state = drawing.state
    return id
  },
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'saveDrawingToDB'
)

export const saveDrawingPaletteColors = securizeAsyncFn(
  async (localDbId: number, colors: any[] = []) => {
    await updateLocalDrawing(localDbId, {
      colors,
    })
  },
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'saveDrawingPaletteColors'
)

export const saveDrawingGpsCoordinates = securizeAsyncFn(
  async (
    localDbId: number,
    gpsCoordinates: { lat: number; lon: number; accuracy?: number },
    dashboardCoordinates: { x: number; y: number; px4mm: number }
  ) => {
    await updateLocalDrawing(localDbId, {
      gpsCoordinates,
      dashboardCoordinates,
    })
  },
  DEFAULT_LOCAL_DB_ERROR_MSG,
  'saveDrawingGpsCoordinates'
)
