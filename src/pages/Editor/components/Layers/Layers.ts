import './layers.css'

import Params from 'main/Params'
import * as Toolbar from 'pages/Editor/components/Toolbar'
import { preventDefault, createDom } from 'utils/domUtils'
import { mount } from 'ui/mount'
import { cleanRefs, getRealScreenMaxSize } from 'utils/moduleUtils'
import { addListScrollClickAndPressHandlers, addVerticalDragSliderHandler } from 'utils/uiUtils'
import { LayersView } from './LayersView'
import {
  MAX_LAYER_NAME_LENGTH,
  config,
  state,
  refs,
  clearUsersLayersHistory,
  getCurrentSelectedLayerId,
  getLayerContext,
  getMagnetismCoords,
  hardDeleteLayer,
  initHistories,
  isYourLayerEmpty,
  resetLayersState,
  setLayerCoordsAfterDragResize,
  updateMagnetismCoords,
} from './layersState'
import { exportLayers, exportWholeCanvasData } from './layersExport'
import {
  addLayerHistoryContentChangedStep,
  doRedoForUser,
  doUndoForUser,
  redoLayers,
  undoLayers,
} from './layersHistory'
import {
  addNewLayer,
  clearCurrentLayer,
  deleteLayer,
  duplicateSelectedLayer,
  initLayers,
  mergeDownSelectedLayer,
  renameLayer,
  toggleEnableLayer,
} from './layersActions'
import {
  closeParams,
  closeResizeModeIfNeeded,
  flipHorizontally,
  flipVertically,
  gcoModeTouchStart,
  onContainerTouchStart,
  onListClick,
  onListLongPress,
  resizeButtonTouchStart,
  updateCanvasContent,
  updateCurrentTool,
  updateLayerOpacity,
} from './layersListUi'
import {
  addNewLayerFromCoworker,
  clearLayerFromCoworker,
  deleteLayerFromCoworker,
  disableLayerFromCoworker,
  duplicateLayerFromCoworker,
  enableLayerFromCoworker,
  layerDragChangeFromCoworker,
  mergeLayersFromCoworker,
  receiveFlipLayerFromCoworker,
  receiveLayerFromCoworker,
  receiveResizeLayerFromCoworker,
  renameLayerFromCoworker,
  selectCoworkerLayer,
  sendCurrentLayerToCoworker,
  updateLayerOpacityFromCoworker,
} from './layersCoworking'

export {
  getCurrentSelectedLayerId,
  getLayerContext,
  addLayerHistoryContentChangedStep,
  setLayerCoordsAfterDragResize,
  doUndoForUser,
  undoLayers,
  doRedoForUser,
  redoLayers,
  exportLayers,
  exportWholeCanvasData,
  isYourLayerEmpty,
  clearLayerFromCoworker,
  clearCurrentLayer,
  closeParams,
  selectCoworkerLayer,
  addNewLayerFromCoworker,
  deleteLayerFromCoworker,
  receiveLayerFromCoworker,
  renameLayerFromCoworker,
  duplicateLayerFromCoworker,
  mergeLayersFromCoworker,
  enableLayerFromCoworker,
  disableLayerFromCoworker,
  updateCanvasContent,
  updateMagnetismCoords,
  getMagnetismCoords,
  receiveResizeLayerFromCoworker,
  closeResizeModeIfNeeded,
  updateCurrentTool,
  receiveFlipLayerFromCoworker,
  updateLayerOpacityFromCoworker,
  layerDragChangeFromCoworker,
}

const initDom = async (moduleContainer: HTMLElement) => {
  mount(
    moduleContainer,
    LayersView({
      maxLength: MAX_LAYER_NAME_LENGTH,
      refs,
    })
  )
  refs.gcoButton = createDom('png-icon-source-over')
  refs.resizeButton?.classList.toggle('selected', state.resizeMode)

  refs.layerListElement?.remove()
  refs.paramsContainer?.addEventListener(Params.eventStart, preventDefault)
  refs.gcoButton.addEventListener(Params.eventStart, gcoModeTouchStart)
  refs.resizeButton?.addEventListener(Params.eventStart, resizeButtonTouchStart)
  refs.layersContainer?.addEventListener(Params.eventStart, onContainerTouchStart)
  refs.addNewLayerButton?.addEventListener(Params.eventStart, addNewLayer)
  refs.flipVerticalButton?.addEventListener(Params.eventStart, flipVertically)
  refs.flipHorizontalButton?.addEventListener(Params.eventStart, flipHorizontally)
  refs.visibilityLayerButton?.addEventListener(Params.eventStart, toggleEnableLayer)
  refs.editLayerNameButton?.addEventListener(Params.eventStart, renameLayer)
  refs.duplicateLayerButton?.addEventListener(Params.eventStart, duplicateSelectedLayer)
  refs.mergeDownLayerButton?.addEventListener(Params.eventStart, mergeDownSelectedLayer)
  refs.deleteLayerButton?.addEventListener(Params.eventStart, deleteLayer)
  refs.sendLayerButton?.addEventListener(Params.eventStart, sendCurrentLayerToCoworker)
  if (refs.layersList) {
    addListScrollClickAndPressHandlers(refs.layersList, onListClick, onListLongPress)
  }
  if (refs.opacityCursor && refs.opacitySlider) {
    addVerticalDragSliderHandler(
      refs.opacityCursor,
      refs.opacitySlider,
      updateLayerOpacity,
      100,
      0,
      false,
      0
    )
  }
  if (refs.resizeButton) {
    Toolbar.addOptionButtonsGroup([refs.resizeButton, refs.gcoButton])
  }
}

export const init = async (
  moduleContainer: HTMLElement,
  initialLayers: unknown[],
  canvasWidth: number,
  canvasHeight: number,
  coworkersId: string[] = []
) => {
  initHistories(coworkersId)

  config.maxLayersNumber = config.maxLayersNumberHighPerf
  if (Params.isTablet && Params.ios) {
    const screenMaxSize = getRealScreenMaxSize()
    if (screenMaxSize < 2200) {
      config.maxLayersNumber = config.maxLayersNumberMediumPerf
    }
  }
  resetLayersState()
  await initDom(moduleContainer)
  if (refs.layersList) refs.layersList.scrollTop = 1
  await initLayers(initialLayers, canvasWidth, canvasHeight)

  setTimeout(() => {
    if (refs.layersList) {
      const selected = refs.layersList.querySelector(
        '.editor-layers__layer-selected'
      ) as HTMLElement | null
      refs.layersList.scrollTop = selected?.offsetTop || 0
    }
  }, 200)
}

export const remove = (isSavingLayers = false) => {
  if (state.layers) {
    Object.values(state.layers).forEach((layer) => hardDeleteLayer(layer.id, !isSavingLayers))
  }
  if (state.deletedLayers) {
    Object.values(state.deletedLayers).forEach((layer) => hardDeleteLayer(layer.id, true))
  }
  clearUsersLayersHistory()
  cleanRefs(refs)
  resetLayersState()
}
