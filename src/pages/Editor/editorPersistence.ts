import * as Coworking from 'modules/Coworking'
import * as Messages from 'modules/Messages'
import * as ColorPicker from './components/ColorPicker'
import { PaletteColor } from './components/ColorPicker/ColorPicker'
import * as Toolbar from './components/Toolbar'
import * as Layers from './components/Layers'
import * as Tools from './components/Tools'
import { addPreventPageRefresh, removePreventPageRefresh } from 'app/shellState'
import { emitCoworkingEvent } from 'app/coworkingBus'
import { openPageFolder } from 'app/navigation'
import { setSpinner } from 'utils/domUtils'
import { noop } from 'utils/jsUtils'
import {
  saveDrawingToDB,
  saveDrawingPaletteColors,
  saveDrawingLayersSidebarExpanded,
  setBackgroundSavingId,
} from 'utils/localDbUtils'
import { EditorState } from './editorTypes'

const labels = {
  draftError: 'An error occurred during draft saving',
  copySaved: 'New copy saved',
  areYouSureToCloseCoworking: 'Are you sure to close the drawing session?',
}

interface ExportedDrawingData {
  base64: string
  width: number
  height: number
  canvasWidth: number
  canvasHeight: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  paper: string | undefined
  localDbId?: number | false
  colors?: PaletteColor[]
  selectedColorId?: number
  toolsCustomProps?: unknown[]
  selectedTool?: unknown
  madeByCorowking?: boolean
  layers?: unknown[]
  layersSidebarExpanded?: boolean
}

const getCurrentDrawingInfo = async (state: EditorState): Promise<ExportedDrawingData> => {
  const currentDrawing = (await Layers.exportWholeCanvasData()) as ExportedDrawingData
  currentDrawing.localDbId = state.localDbDrawId
  currentDrawing.colors = ColorPicker.getCurrentColorsPalette()
  currentDrawing.selectedColorId = ColorPicker.getCurrentSelectedColorId()
  currentDrawing.toolsCustomProps = Tools.getToolsCustomProps()
  currentDrawing.selectedTool = Tools.getCurrentSelectedTool()
  currentDrawing.layersSidebarExpanded = Layers.isLayersSidebarExpanded()
  return currentDrawing
}

const save = async (
  state: EditorState,
  {
    onSave = noop,
    onError = noop,
    asDraft = false,
    asCopy = false,
  }: {
    onSave?: (id: number) => void
    onError?: () => void
    asDraft?: boolean
    asCopy?: boolean
  } = {}
) => {
  if (state.modifiedSinceLastSave) {
    const currentDrawing = await getCurrentDrawingInfo(state)
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

export const setDraftInterval = (
  state: EditorState,
  editorConfig: { draftTimeInterval: number; draftInfoDuration: number },
  start: boolean,
  onSetLastActiveId: (id: number) => void
) => {
  if (state.draftInterval) {
    clearInterval(state.draftInterval)
  }
  state.draftInterval = false

  if (start) {
    state.draftInterval = setInterval(
      () => saveDraft(state, editorConfig, onSetLastActiveId),
      editorConfig.draftTimeInterval
    )
  }
}

const saveDraft = (
  state: EditorState,
  editorConfig: { draftTimeInterval: number; draftInfoDuration: number },
  onSetLastActiveId: (id: number) => void
) => {
  if (!state.currentTouch.isDown && state.modifiedSinceLastSave) {
    setDraftInterval(state, editorConfig, true, onSetLastActiveId)
    save(state, {
      onSave: (draftId: number) => {
        state.drawnStepsSinceDraft = 0
        state.modifiedSinceLastSave = false
        onSetLastActiveId(draftId)
        if (state.localDbDrawId === false) {
          state.localDbDrawId = draftId
        }
      },
      onError: () => {
        state.localDbDrawId = false
        Messages.error(labels.draftError)
      },
      asDraft: true,
    })
  }
}

export const saveCopy = (state: EditorState, editorConfig: { draftInfoDuration: number }) =>
  save(state, {
    onSave: () => {
      state.modifiedSinceLastCopy = false
      Messages.info(labels.copySaved, editorConfig.draftInfoDuration)
      Toolbar.disableSaveCopy()
    },
    onError: () => {
      Messages.error(labels.draftError)
      Toolbar.enableSaveCopy()
    },
    asCopy: true,
  })

export const saveDrawingsPalette = (state: EditorState, colors: PaletteColor[] = []) => {
  if (state.localDbDrawId && colors.length) {
    saveDrawingPaletteColors(state.localDbDrawId, colors)
  }
}

export const saveLayersSidebarExpanded = (state: EditorState, expanded: boolean) => {
  if (state.localDbDrawId) {
    saveDrawingLayersSidebarExpanded(state.localDbDrawId, expanded)
  }
}

export const setDrawingModified = (
  state: EditorState,
  editorConfig: {
    draftStepsInterval: number
    draftTimeInterval: number
    draftInfoDuration: number
  },
  onSetLastActiveId: (id: number) => void
) => {
  state.modifiedSinceLastSave = true
  state.drawnStepsSinceDraft += 1
  if (state.drawnStepsSinceDraft >= editorConfig.draftStepsInterval) {
    saveDraft(state, editorConfig, onSetLastActiveId)
  }
  if (!state.modifiedSinceLastCopy) {
    state.modifiedSinceLastCopy = true
    Toolbar.enableSaveCopy()
  }
}

export const saveAndGoToFolder = async (
  state: EditorState,
  editorConfig: { draftTimeInterval: number; draftInfoDuration: number },
  onSetLastActiveId: (id: number) => void
) => {
  if (!Coworking.isOpen() || (await Messages.confirm(labels.areYouSureToCloseCoworking))) {
    const madeByCorowking = Coworking.isOpen()
    setSpinner(true)
    setDraftInterval(state, editorConfig, false, onSetLastActiveId)
    Coworking.stop()
    if (state.modifiedSinceLastSave) {
      const currentDrawing = await getCurrentDrawingInfo(state)
      if (currentDrawing.maxX >= 0) {
        currentDrawing.layers = []
        currentDrawing.madeByCorowking = madeByCorowking
        const savedId = await saveDrawingToDB(currentDrawing)
        currentDrawing.localDbId = savedId
        state.localDbDrawId = savedId
        onSetLastActiveId(savedId)
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
          emitCoworkingEvent('updateFolderDrawingsLoading', undefined)
        })
      }
    }
    openPageFolder()
  }
}
