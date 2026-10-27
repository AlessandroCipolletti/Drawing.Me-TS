import './toolbar.css'

import Params from 'main/Params'
import { editorFacade } from 'pages/Editor/editorFacade'
import { CurrentToolProps } from 'pages/Editor/editorTypes'
import { toolDefaultProps } from 'pages/Editor/config'
import { editorCalls, registerEditorCalls } from 'pages/Editor/editorCalls'
import { cleanRefs } from 'utils/moduleUtils'
import { deepCopy } from 'utils/jsUtils'
import {
  preventDefault,
  disableElements,
  enableElements,
  getEventCoordX,
  createDom,
} from 'utils/domUtils'
import { mount } from 'ui/mount'
import { ToolbarView, ToolbarRefs } from './ToolbarView'
import { addHorizontalDragSliderHandler } from 'utils/uiUtils'
import {
  round,
  logarithmicPercToValue,
  logarithmicValueToPerc,
  getNumberInBetween,
} from 'utils/mathUtils'
import {
  cursorButtonTouchStart,
  getToolPreviewTouchEvents,
  PreviewTouchSample,
} from './toolbarUtils'
import { fadeOutElements } from 'utils/animationsUtils'
import { getNewContextForCanvas } from 'utils/canvasUtils'
import { renderBrushPreview } from 'pages/Editor/brushPreviewPipeline'
import { timing, spacing } from 'main/Theme'
import {
  mountGuidesPanel,
  closeGuidesPanel,
  showGuidesPanel,
  setGuidesParamsInactivityBumper,
  setGuidesToolbarSyncHandler,
  notifyGuidesPanelChange,
  syncGuidesPanelUi,
} from 'pages/Editor/guides/guidesPanel'
import {
  disableSymmetryGuides,
  guidesState,
  restoreLastSymmetryMode,
} from 'pages/Editor/guides/guidesState'
import { isGuidesActive } from 'pages/Editor/guides/guideTypes'

const config = {
  paramsCloseDelay: 7 * 1000,
  guidesParamsCloseDelay: 20 * 1000,
  toolPreviewCanvasSize: 30,
  slidersWaitingTime: 0, // Fix legacy bug: coalesce preview via requestAnimationFrame instead of 40ms timeout
}

interface ToolbarState {
  paramsTimeout: ReturnType<typeof setTimeout> | false
  sizePerc: number
  sizeValue: number
  alphaPerc: number
  alphaValue: number
  currentParamsProp: '' | 'size' | 'alpha' | 'guides'
  currentToolProps: CurrentToolProps
  toolPreviewCanvasSize: number
  toolPreviewTouchEvents: PreviewTouchSample[] | false
}

const initialState: ToolbarState = {
  paramsTimeout: false,
  sizePerc: 0,
  sizeValue: 0,
  alphaPerc: 0,
  alphaValue: 0,
  currentParamsProp: '',
  currentToolProps: {
    ...toolDefaultProps,
    color: '',
    randomColor: true,
  },
  toolPreviewCanvasSize: 0,
  toolPreviewTouchEvents: false,
}

let state: ToolbarState = deepCopy(initialState)
let previewRafPending = false
let guidesParamsTeardownTimer: ReturnType<typeof setTimeout> | false = false

const optionsShowTransitionMs = () => parseInt(timing.OPTIONS_SHOW_TRANSITION, 10) || 500

const cancelGuidesParamsTeardown = () => {
  if (guidesParamsTeardownTimer !== false) {
    clearTimeout(guidesParamsTeardownTimer)
    guidesParamsTeardownTimer = false
  }
}

const finishGuidesParamsUiNow = () => {
  cancelGuidesParamsTeardown()
  refs.params?.classList.remove('editor-toolbar__params--guides')
  closeGuidesPanel()
}

const scheduleGuidesParamsUiTeardown = () => {
  cancelGuidesParamsTeardown()
  guidesParamsTeardownTimer = setTimeout(() => {
    guidesParamsTeardownTimer = false
    finishGuidesParamsUiNow()
  }, optionsShowTransitionMs())
}

const refs: ToolbarRefs = {
  container: null,
  params: null,
  leftSide: null,
  centerSide: null,
  rightSide: null,
  backButton: null,
  saveCopyButton: null,
  goFullscreenButton: null,
  slider: null,
  sliderLabel: null,
  sliderCursor: null,
  sizeButton: null,
  alphaButton: null,
  alphaIcon: null,
  sizeLabel: null,
  alphaLabel: null,
  toolPreview: null,
  toolPreviewPopup: null,
  toolPreviewCanvas: null,
  toolPreviewContext: null,
  guidesButton: null,
  guidesPanelSlot: null,
}

const toggleParams = () => {
  if (refs.params?.classList.contains('params-container-visible')) {
    closeParams()
  } else {
    openParams()
  }
}

const openParams = () => {
  if (state.paramsTimeout !== false) {
    clearTimeout(state.paramsTimeout)
  }
  state.paramsTimeout = setTimeout(closeParams, config.paramsCloseDelay)
  refs.params?.classList.add('params-container-visible')
}

const bumpGuidesParamsInactivityTimeout = () => {
  if (state.currentParamsProp !== 'guides') return
  if (!refs.params?.classList.contains('params-container-visible')) return
  if (state.paramsTimeout !== false) {
    clearTimeout(state.paramsTimeout)
  }
  state.paramsTimeout = setTimeout(closeParams, config.guidesParamsCloseDelay)
}

const openGuidesParams = () => {
  cancelGuidesParamsTeardown()
  if (state.paramsTimeout !== false) {
    clearTimeout(state.paramsTimeout)
  }
  state.paramsTimeout = setTimeout(closeParams, config.guidesParamsCloseDelay)
  refs.params?.classList.add('editor-toolbar__params--guides')
  showGuidesPanel()
  refs.params?.classList.add('params-container-visible')
  state.currentParamsProp = 'guides'
  syncGuidesToolbarChrome()
}

const leaveGuidesParamsMode = () => {
  finishGuidesParamsUiNow()
}

export const syncGuidesToolbarChrome = () => {
  refs.guidesButton?.classList.toggle('selected', isGuidesActive(guidesState))
}

export const closeParams = () => {
  if (state.paramsTimeout !== false) {
    clearTimeout(state.paramsTimeout)
  }
  state.paramsTimeout = false
  const closingGuides =
    state.currentParamsProp === 'guides' ||
    Boolean(refs.params?.classList.contains('editor-toolbar__params--guides'))
  refs.params?.classList.remove('params-container-visible')
  state.currentParamsProp = ''
  syncGuidesToolbarChrome()
  if (closingGuides) {
    scheduleGuidesParamsUiTeardown()
  } else {
    finishGuidesParamsUiNow()
  }
}

const updateToolPreview = () => {
  previewRafPending = false
  if (!refs.toolPreviewContext || !state.currentToolProps) return
  const toolsProps: CurrentToolProps = {
    ...state.currentToolProps,
    alpha: state.alphaValue,
    size: state.sizeValue,
    globalCompositeOperation:
      state.currentToolProps.globalCompositeOperation === 'destination-out'
        ? 'destination-out'
        : 'source-over',
  }
  state.toolPreviewTouchEvents =
    state.toolPreviewTouchEvents ||
    getToolPreviewTouchEvents(state.toolPreviewCanvasSize * Params.pxScale)

  renderBrushPreview(refs.toolPreviewContext, toolsProps, state.toolPreviewTouchEvents)
}

const openPreviewPopups = () => {
  if (!previewRafPending) {
    previewRafPending = true
    requestAnimationFrame(updateToolPreview)
  }
  refs.toolPreview?.classList.add('tool-preview-visible')
  refs.toolPreview?.classList.remove('displayNone')
}

const closePreviewPopups = () => {
  if (refs.toolPreview) {
    fadeOutElements(refs.toolPreview, { duration: parseInt(timing.FAST_FADE, 10) })
    refs.toolPreview.classList.remove('tool-preview-visible')
  }
}

const updateParams = (value: number) => {
  if (refs.sliderCursor) refs.sliderCursor.style.left = `${value}%`
  if (refs.slider) {
    refs.slider.style.backgroundImage = `linear-gradient(90deg, var(--palette-gray-1) ${value}%, var(--palette-gray-6) ${value}%)`
  }
  if (refs.sliderLabel) refs.sliderLabel.innerHTML = `${value}`
}

const onSliderDrag = (value: number, inProgress: boolean) => {
  if (state.currentParamsProp === 'guides') {
    return
  }
  leaveGuidesParamsMode()
  openParams()
  if (state.currentParamsProp === 'size') {
    updateSize(value, inProgress)
  } else {
    updateAlpha(value, inProgress)
  }
}

const updateSize = (perc: number, inProgress: boolean) => {
  const sizeValue = logarithmicPercToValue(
    perc,
    state.currentToolProps.minSize,
    state.currentToolProps.maxSize,
    1
  )
  state.sizePerc = perc
  state.sizeValue = sizeValue
  if (refs.sizeLabel) refs.sizeLabel.innerHTML = `${perc}%`
  updateParams(perc)

  if (inProgress) {
    openPreviewPopups()
  } else {
    closePreviewPopups()
    editorCalls.setCurrentToolCustomProps({
      size: sizeValue,
    })
  }
}

const updateAlpha = (perc: number, inProgress: boolean) => {
  const alphaValue = logarithmicPercToValue(
    perc,
    state.currentToolProps.minAlpha,
    state.currentToolProps.maxAlpha,
    3
  )
  state.alphaPerc = perc
  state.alphaValue = alphaValue
  if (refs.alphaLabel) refs.alphaLabel.innerHTML = `${perc}%`
  updateParams(perc)

  if (inProgress) {
    openPreviewPopups()
  } else {
    closePreviewPopups()
    editorCalls.setCurrentToolCustomProps({
      alpha: alphaValue,
    })
  }
}

const dismissGuidesParamsForBrushParams = () => {
  cancelGuidesParamsTeardown()
  if (state.paramsTimeout !== false) {
    clearTimeout(state.paramsTimeout)
    state.paramsTimeout = false
  }
  refs.params?.classList.remove('params-container-visible')
  finishGuidesParamsUiNow()
  if (state.currentParamsProp === 'guides') {
    state.currentParamsProp = ''
  }
}

const openBrushParam = (prop: 'size' | 'alpha', perc: number) => {
  if (state.currentParamsProp === 'guides') {
    dismissGuidesParamsForBrushParams()
  } else {
    leaveGuidesParamsMode()
  }
  if (state.currentParamsProp === prop) {
    toggleParams()
  } else {
    updateParams(perc)
    openParams()
    state.currentParamsProp = prop
  }
  syncGuidesToolbarChrome()
}

const onSizeSingleTap = () => {
  openBrushParam('size', state.sizePerc)
}

const onAlphaSingleTap = () => {
  openBrushParam('alpha', state.alphaPerc)
}

const onSizeTouchStart = (e: Event) => {
  preventDefault(e)
  if (!refs.sizeButton?.classList.contains('disabled')) {
    editorCalls.closeResizeModeIfNeeded()
    cursorButtonTouchStart(
      state.sizePerc,
      getEventCoordX(e),
      updateSize,
      onSizeSingleTap,
      config.slidersWaitingTime
    )
  }
}

const onAlphaTouchStart = (e: Event) => {
  preventDefault(e)
  if (!refs.alphaButton?.classList.contains('disabled')) {
    editorCalls.closeResizeModeIfNeeded()
    cursorButtonTouchStart(
      state.alphaPerc,
      getEventCoordX(e),
      updateAlpha,
      onAlphaSingleTap,
      config.slidersWaitingTime
    )
  }
}

const toggleSizeAndAlpha = (enabled: boolean) => {
  refs.sizeButton?.classList.toggle('disabled', !enabled)
  refs.alphaButton?.classList.toggle('disabled', !enabled)
  if (!enabled) {
    closeParams()
  }
}

const applyAlphaControlPresentation = (toolName: string) => {
  const isSmudge = toolName === 'smudge'
  refs.alphaButton?.classList.toggle('editor-toolbar__alpha--strength', isSmudge)
  refs.alphaButton?.setAttribute('aria-label', isSmudge ? 'Strength' : 'Opacity')
  if (refs.alphaIcon) {
    refs.alphaIcon.classList.toggle('svg-icon-opacity', !isSmudge)
    refs.alphaIcon.classList.toggle('svg-icon-strength', isSmudge)
  }
}

export const setTool = (toolProps: CurrentToolProps) => {
  toggleSizeAndAlpha(Boolean(toolProps.hasSizeAndAlpha))
  applyAlphaControlPresentation(toolProps.name)
  state.sizeValue = toolProps.size
  state.sizePerc = getNumberInBetween(
    1,
    100,
    logarithmicValueToPerc(toolProps.size, toolProps.minSize, toolProps.maxSize, 0)
  )
  state.alphaValue = toolProps.alpha
  state.alphaPerc = getNumberInBetween(
    1,
    100,
    logarithmicValueToPerc(toolProps.alpha, toolProps.minAlpha, toolProps.maxAlpha, 0)
  )
  if (refs.sizeLabel) refs.sizeLabel.innerHTML = `${state.sizePerc}%`
  if (refs.alphaLabel) refs.alphaLabel.innerHTML = `${state.alphaPerc}%`
  state.currentToolProps = { ...toolProps }
  closeParams()
}

export const disableSaveCopy = () => {
  if (refs.saveCopyButton) disableElements(refs.saveCopyButton)
}

export const enableSaveCopy = () => {
  if (refs.saveCopyButton) enableElements(refs.saveCopyButton)
}

const addOptionButtonsGroup = (
  buttons: HTMLElement[] = [],
  side: 'left' | 'center' | 'right' = 'center'
) => {
  const wrapper = createDom('editor-toolbar__options-group')
  const items = [...buttons]
  if (side === 'center' && refs.guidesButton) {
    const insertIndex = items.length >= 2 ? items.length - 2 : items.length
    items.splice(insertIndex, 0, refs.guidesButton)
  }
  for (const button of items) {
    button.classList.add('editor-toolbar__button')
    wrapper.appendChild(button)
  }
  if (side === 'left') {
    refs.leftSide?.appendChild(createDom('editor-toolbar__spacer'))
    refs.leftSide?.appendChild(wrapper)
  } else if (side === 'center') {
    refs.centerSide?.appendChild(wrapper)
  } else if (side === 'right') {
    refs.rightSide?.appendChild(wrapper)
    refs.rightSide?.appendChild(createDom('editor-toolbar__spacer'))
  }
}

let statusLabelParent: HTMLElement | null = null
let statusLabelNext: ChildNode | null = null

const moveStatusLabelIntoHeader = () => {
  const label = document.querySelector('.messages__update')
  if (!label || !refs.leftSide) return
  statusLabelParent = label.parentElement
  statusLabelNext = label.nextSibling
  refs.leftSide.insertBefore(label, refs.leftSide.firstChild)
}

const restoreStatusLabel = () => {
  const label = document.querySelector('.messages__update')
  if (!label || !statusLabelParent) return
  if (statusLabelNext && statusLabelNext.parentElement === statusLabelParent) {
    statusLabelParent.insertBefore(label, statusLabelNext)
  } else {
    statusLabelParent.appendChild(label)
  }
  statusLabelParent = null
  statusLabelNext = null
}

const initDom = async (container: HTMLElement) => {
  mount(container, ToolbarView({ refs }))
  moveStatusLabelIntoHeader()

  if (refs.toolPreviewPopup && refs.toolPreviewCanvas) {
    refs.toolPreviewPopup.style.width = `${state.toolPreviewCanvasSize}px`
    refs.toolPreviewPopup.style.height = `${state.toolPreviewCanvasSize}px`
    refs.toolPreviewCanvas.style.width = `${state.toolPreviewCanvasSize}px`
    refs.toolPreviewCanvas.style.height = `${state.toolPreviewCanvasSize}px`
    refs.toolPreviewCanvas.width = state.toolPreviewCanvasSize * Params.pxScale
    refs.toolPreviewCanvas.height = state.toolPreviewCanvasSize * Params.pxScale
    refs.toolPreviewContext = getNewContextForCanvas(refs.toolPreviewCanvas)
  }

  if (refs.sliderCursor && refs.slider) {
    addHorizontalDragSliderHandler(
      refs.sliderCursor,
      refs.slider,
      onSliderDrag,
      100,
      1,
      false,
      0,
      config.slidersWaitingTime
    )
  }
  if (Params.isPhone) {
    refs.saveCopyButton?.remove()
  } else {
    refs.saveCopyButton?.addEventListener(Params.eventStart, editorFacade.saveCopy)
    disableSaveCopy()
  }
  refs.sizeButton?.addEventListener(Params.eventStart, onSizeTouchStart)
  refs.alphaButton?.addEventListener(Params.eventStart, onAlphaTouchStart)
  if (refs.guidesPanelSlot) {
    mountGuidesPanel(refs.guidesPanelSlot)
  }
  setGuidesParamsInactivityBumper(bumpGuidesParamsInactivityTimeout)
  setGuidesToolbarSyncHandler(syncGuidesToolbarChrome)
  syncGuidesToolbarChrome()
  refs.guidesButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    editorCalls.closeResizeModeIfNeeded()
    const paramsVisible = refs.params?.classList.contains('params-container-visible')
    const guidesPanelOpen = state.currentParamsProp === 'guides' && paramsVisible

    if (isGuidesActive(guidesState)) {
      disableSymmetryGuides()
      closeParams()
      syncGuidesPanelUi()
      notifyGuidesPanelChange()
      syncGuidesToolbarChrome()
      return
    }

    if (guidesPanelOpen) {
      closeParams()
      return
    }

    if (paramsVisible) {
      closeParams()
    }

    if (restoreLastSymmetryMode()) {
      syncGuidesPanelUi()
      notifyGuidesPanelChange()
    }
    openGuidesParams()
  })
  refs.backButton?.addEventListener(Params.eventStart, editorFacade.saveAndGoToFolder)
  refs.goFullscreenButton?.addEventListener(Params.eventStart, editorFacade.toggleFullscreen)
}

export const init = async (container: HTMLElement) => {
  cancelGuidesParamsTeardown()
  state = deepCopy(initialState)
  previewRafPending = false
  if (Params.isPhone) {
    config.toolPreviewCanvasSize = 30
  }
  state.toolPreviewCanvasSize = round(config.toolPreviewCanvasSize * spacing.ONE_REM, 0)
  await initDom(container)
}

export const remove = async () => {
  cancelGuidesParamsTeardown()
  finishGuidesParamsUiNow()
  restoreStatusLabel()
  state = deepCopy(initialState)
  previewRafPending = false
  cleanRefs(refs)
}

registerEditorCalls({
  addOptionButtonsGroup,
})
