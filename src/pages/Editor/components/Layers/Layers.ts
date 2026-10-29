import './layers.css'

import Params from 'main/Params'
import { editorCalls, registerEditorCalls } from 'pages/Editor/editorCalls'
import { registerEditorCoworkingPort } from 'app/editorCoworkingPort'
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
  areLayersReady,
  LayerRecord,
  initHistories,
  isYourLayerEmpty,
  markLayersReady,
  resetLayersState,
  setLayerCoordsAfterDragResize,
  updateMagnetismCoords,
} from './layersState'
import { exportLayers, exportWholeCanvasData } from './layersExport'
import {
  addLayerHistoryContentChangedStep,
  replaceLatestLayerHistoryContentStep,
  restoreLayerBeforeStrokeForCoworker,
  doRedoForUser,
  doUndoForUser,
  redoLayers,
  undoLayers,
} from './layersHistory'
import {
  addNewLayer,
  clearCurrentLayer,
  clearLassoSelection,
  copyLassoSelectionToNewLayer,
  cutLassoSelectionToNewLayer,
  deleteLayer,
  duplicateSelectedLayer,
  initLayers,
  mergeDownSelectedLayer,
  toggleMaskDownSelectedLayer,
  renameLayer,
  toggleEnableLayer,
  createNewTextLayer,
  deleteEmptyTransientLayer,
  saveLayerNameDirect,
  selectLayerById,
  updateLayerBoundsAndPreview,
} from './layersActions'
import {
  beginMagicWandSelection,
  canCreateLayerFromLasso,
  cancelLassoSelection,
  cancelMagicWandSelection,
  prepareMagicWandStroke,
  syncMagicWandTool,
  closeParams,
  closePointerAnchoredParams,
  closeResizeModeIfNeeded,
  commitLassoMoveSelectionInPlace,
  completeLassoSelection,
  completeMagicWandSelection,
  discardPendingLassoSelection,
  flipHorizontally,
  flipVertically,
  editTextButtonTouchStart,
  blendModeChipTouchStart,
  gcoModeTouchStart,
  getActiveLassoSelection,
  hasActiveLassoSelection,
  hasPendingLassoFloat,
  commitPendingLassoFloat,
  lassoButtonTouchStart,
  layersToggleButtonTouchStart,
  setLayersSidebarExpanded,
  isLayersSidebarExpanded,
  onContainerTouchStart,
  onLayerContextMenu,
  openSelectedLayerOptionsAtPointer,
  onListClick,
  onListLongPress,
  refreshActiveLassoSelection,
  resizeButtonTouchStart,
  startTransformLassoSelectionInPlace,
  translateLassoSelectionInPlace,
  canvasPanButtonTouchStart,
  updateCanvasContent,
  bakeResizeSessionWorkingPixels,
  confirmResizeModeFromToolbar,
  updateCurrentTool,
  updateLassoSelectionOptions,
  updateLayerOpacity,
  updateMagicWandSelectionTolerance,
} from './layersListUi'
import { adjustParamsButtonTouchStart, initLayerAdjustmentBar } from './layerAdjustmentPanel'
import {
  registerInvalidateAdjustmentsForTarget,
  registerSyncAdjustmentLayerDisplay,
} from './layerDisplayHooks'
import {
  invalidateAdjustmentsForTarget,
  renderAndCompositeAdjustment,
} from './layerAdjustmentRender'
import {
  addNewLayerFromCoworker,
  clearLayerFromCoworker,
  deleteLayerFromCoworker,
  disableLayerFromCoworker,
  duplicateLayerFromCoworker,
  enableLayerFromCoworker,
  layerDragChangeFromCoworker,
  mergeLayersFromCoworker,
  receiveLassoClearFromCoworker,
  receiveLassoCopyToLayerFromCoworker,
  receiveLassoCutToLayerFromCoworker,
  receiveLassoTransformFromCoworker,
  receiveLayerMaskFromCoworker,
  receiveFlipLayerFromCoworker,
  receiveLayerFromCoworker,
  receiveAdjustmentLayerCreateFromCoworker,
  receiveAdjustmentLayerUpdateFromCoworker,
  receiveAdjustmentLayerBakeFromCoworker,
  receiveTextLayerUpdateFromCoworker,
  receiveResizeLayerFromCoworker,
  renameLayerFromCoworker,
  selectCoworkerLayer,
  sendCurrentLayerToCoworker,
  updateLayerOpacityFromCoworker,
  updateLayerBlendModeFromCoworker,
} from './layersCoworking'

export {
  getCurrentSelectedLayerId,
  getLayerContext,
  addLayerHistoryContentChangedStep,
  replaceLatestLayerHistoryContentStep,
  restoreLayerBeforeStrokeForCoworker,
  setLayerCoordsAfterDragResize,
  undoLayers,
  redoLayers,
  exportLayers,
  exportWholeCanvasData,
  isYourLayerEmpty,
  clearCurrentLayer,
  closeParams,
  updateCanvasContent,
  bakeResizeSessionWorkingPixels,
  confirmResizeModeFromToolbar,
  updateMagnetismCoords,
  getMagnetismCoords,
  closeResizeModeIfNeeded,
  canCreateLayerFromLasso,
  hasActiveLassoSelection,
  getActiveLassoSelection,
  discardPendingLassoSelection,
  beginMagicWandSelection,
  updateMagicWandSelectionTolerance,
  completeMagicWandSelection,
  cancelMagicWandSelection,
  prepareMagicWandStroke,
  syncMagicWandTool,
  completeLassoSelection,
  refreshActiveLassoSelection,
  updateLassoSelectionOptions,
  translateLassoSelectionInPlace,
  commitLassoMoveSelectionInPlace,
  hasPendingLassoFloat,
  commitPendingLassoFloat,
  cancelLassoSelection,
  clearLassoSelection,
  startTransformLassoSelectionInPlace,
  copyLassoSelectionToNewLayer,
  cutLassoSelectionToNewLayer,
  createNewTextLayer,
  deleteEmptyTransientLayer,
  saveLayerNameDirect,
  selectLayerById,
  updateLayerBoundsAndPreview,
}

const initDom = async (moduleContainer: HTMLElement, sidebarExpanded = false) => {
  mount(
    moduleContainer,
    LayersView({
      maxLength: MAX_LAYER_NAME_LENGTH,
      refs,
    })
  )
  refs.gcoButton = createDom('svg-icon-source-over')
  refs.resizeButton?.classList.toggle('selected', state.resizeMode)
  refs.lassoButton?.classList.toggle(
    'selected',
    state.lassoMode && state.lassoArmed && !state.wandMode
  )
  if (Params.isDesktop) {
    const panBtn = createDom()
    panBtn.appendChild(createDom('editor-layers__pan-button', 'svg-icon-hand', 'svg-icon-dark'))
    panBtn.addEventListener(Params.eventStart, canvasPanButtonTouchStart)
    refs.canvasPanButton = panBtn
  }
  const layersToggleBtn = createDom()
  layersToggleBtn.appendChild(
    createDom('editor-layers__toggle-button', 'svg-icon-layers-mini', 'svg-icon-dark')
  )
  layersToggleBtn.addEventListener(Params.eventStart, layersToggleButtonTouchStart)
  refs.layersToggleButton = layersToggleBtn
  setLayersSidebarExpanded(sidebarExpanded)

  refs.layerListElement?.remove()
  refs.paramsContainer?.addEventListener(Params.eventStart, preventDefault)
  refs.paramsContainer?.addEventListener(Params.eventEnd, (e) => {
    if ('button' in e && (e as PointerEvent).button !== 0) return
    const target = e.target
    if (
      target instanceof Node &&
      (refs.opacitySlider?.contains(target) || refs.opacityCursor?.contains(target))
    ) {
      return
    }
    closePointerAnchoredParams()
  })
  refs.gcoButton.addEventListener(Params.eventStart, gcoModeTouchStart)
  refs.blendModeChip?.addEventListener(Params.eventStart, blendModeChipTouchStart)
  refs.resizeButton?.addEventListener(Params.eventStart, resizeButtonTouchStart)
  refs.lassoButton?.addEventListener(Params.eventStart, lassoButtonTouchStart)
  refs.adjustParamsButton?.addEventListener(Params.eventStart, adjustParamsButtonTouchStart)
  initLayerAdjustmentBar()
  registerSyncAdjustmentLayerDisplay((layerId) => {
    void renderAndCompositeAdjustment(layerId, 'full')
  })
  registerInvalidateAdjustmentsForTarget(invalidateAdjustmentsForTarget)
  refs.layersContainer?.addEventListener(Params.eventStart, onContainerTouchStart)
  refs.addNewLayerButton?.addEventListener(Params.eventStart, addNewLayer)
  refs.flipVerticalButton?.addEventListener(Params.eventStart, flipVertically)
  refs.flipHorizontalButton?.addEventListener(Params.eventStart, flipHorizontally)
  refs.editTextButton?.addEventListener(Params.eventStart, editTextButtonTouchStart)
  refs.visibilityLayerButton?.addEventListener(Params.eventStart, toggleEnableLayer)
  refs.editLayerNameButton?.addEventListener(Params.eventStart, renameLayer)
  refs.duplicateLayerButton?.addEventListener(Params.eventStart, duplicateSelectedLayer)
  refs.mergeDownLayerButton?.addEventListener(Params.eventStart, mergeDownSelectedLayer)
  refs.maskDownLayerButton?.addEventListener(Params.eventStart, toggleMaskDownSelectedLayer)
  refs.deleteLayerButton?.addEventListener(Params.eventStart, deleteLayer)
  refs.sendLayerButton?.addEventListener(Params.eventStart, sendCurrentLayerToCoworker)
  if (refs.layersList) {
    addListScrollClickAndPressHandlers(refs.layersList, onListClick, onListLongPress, 20, {
      onSecondaryPointerDown: (e) => {
        void onLayerContextMenu(e)
      },
    })
    if (Params.isDesktop) {
      refs.layersList.addEventListener('contextmenu', onLayerContextMenu, true)
    }
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
  if (refs.resizeButton && refs.lassoButton) {
    const groupButtons =
      Params.isDesktop && refs.canvasPanButton
        ? [
            refs.canvasPanButton,
            refs.resizeButton,
            refs.lassoButton,
            refs.gcoButton,
            refs.layersToggleButton!,
          ]
        : [refs.resizeButton, refs.lassoButton, refs.gcoButton, refs.layersToggleButton!]
    editorCalls.addOptionButtonsGroup(groupButtons)
  }
}

export { isLayersSidebarExpanded, openSelectedLayerOptionsAtPointer }
export { dismissSelectionFilters } from './layerAdjustmentPanel'

export const init = async (
  moduleContainer: HTMLElement,
  initialLayers: unknown[],
  canvasWidth: number,
  canvasHeight: number,
  coworkersId: string[] = [],
  sidebarExpanded = false
) => {
  markLayersReady(false)
  initHistories(coworkersId)

  config.maxLayersNumber = config.maxLayersNumberHighPerf
  if (Params.isTablet && Params.ios) {
    const screenMaxSize = getRealScreenMaxSize()
    if (screenMaxSize < 2200) {
      config.maxLayersNumber = config.maxLayersNumberMediumPerf
    }
  }
  resetLayersState()
  await initDom(moduleContainer, sidebarExpanded)
  if (refs.layersList) refs.layersList.scrollTop = 1
  await initLayers(initialLayers, canvasWidth, canvasHeight)
  markLayersReady(true)

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
  markLayersReady(false)
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

registerEditorCalls({
  closeResizeModeIfNeeded,
  updateCurrentTool,
  undoLayers,
  redoLayers,
})

registerEditorCoworkingPort({
  areLayersReady,
  addNewLayerFromCoworker: (layer) => addNewLayerFromCoworker(layer as LayerRecord),
  selectCoworkerLayer,
  doUndoForUser,
  doRedoForUser,
  deleteLayerFromCoworker,
  renameLayerFromCoworker,
  duplicateLayerFromCoworker,
  mergeLayersFromCoworker,
  receiveLassoClearFromCoworker,
  receiveLassoTransformFromCoworker,
  receiveLassoCopyToLayerFromCoworker,
  receiveLassoCutToLayerFromCoworker,
  receiveLayerMaskFromCoworker,
  updateLayerOpacityFromCoworker,
  updateLayerBlendModeFromCoworker,
  enableLayerFromCoworker,
  disableLayerFromCoworker,
  layerDragChangeFromCoworker,
  receiveFlipLayerFromCoworker,
  receiveResizeLayerFromCoworker,
  clearLayerFromCoworker,
  receiveLayerFromCoworker,
  receiveAdjustmentLayerCreateFromCoworker,
  receiveAdjustmentLayerUpdateFromCoworker,
  receiveAdjustmentLayerBakeFromCoworker,
  receiveTextLayerUpdateFromCoworker,
})
