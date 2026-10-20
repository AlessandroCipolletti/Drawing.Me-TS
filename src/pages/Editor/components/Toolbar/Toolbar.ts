import tplToolbar from './toolbar.tpl?raw'
import './toolbar.css'

import Params from 'main/Params'
import * as Editor from 'pages/Editor'
import * as Tools from 'pages/Editor/components/Tools'
import * as Layers from 'pages/Editor/components/Layers'
import { cleanRefs } from 'utils/moduleUtils'
import { deepCopy } from 'utils/jsUtils'
import {
  preventDefault,
  loadTemplate,
  disableElements,
  enableElements,
  getEventCoordX,
  createDom,
} from 'utils/domUtils'
import { addHorizontalDragSliderHandler } from 'utils/uiUtils'
import {
  round,
  logarithmicPercToValue,
  logarithmicValueToPerc,
  getNumberInBetween,
} from 'utils/mathUtils'
import { cursorButtonTouchStart, getToolPreviewTouchEvents } from './toolbarUtils'
import { fadeOutElements } from 'utils/animationsUtils'
import { getNewContextForCanvas, drawMultipleSteps, ExtendedCanvasContext } from 'utils/canvasUtils'
import { getStepsDataFromTouchEvents } from 'pages/Editor/editorUtils'
import { timing, spacing } from 'main/Theme'

const config = {
  paramsCloseDelay: 7 * 1000,
  toolPreviewCanvasSize: 30,
  slidersWaitingTime: 0, // Fix legacy bug: coalesce preview via requestAnimationFrame instead of 40ms timeout
}

let state: Record<string, any> = {}
let previewRafPending = false

const initialState = {
  paramsTimeout: false as ReturnType<typeof setTimeout> | false,
  sizePerc: 0,
  sizeValue: 0,
  alphaPerc: 0,
  alphaValue: 0,
  currentParamsProp: '',
  currentToolProps: {} as Record<string, any>,
  toolPreviewCanvasSize: 0,
  toolPreviewTouchEvents: false as any,
}

const refs: {
  container: HTMLElement | null
  params: HTMLElement | null
  leftSide: HTMLElement | null
  centerSide: HTMLElement | null
  rightSide: HTMLElement | null
  backButton: HTMLElement | null
  saveCopyButton: HTMLElement | null
  goFullscreenButton: HTMLElement | null
  slider: HTMLElement | null
  sliderLabel: HTMLElement | null
  sliderCursor: HTMLElement | null
  sizeButton: HTMLElement | null
  alphaButton: HTMLElement | null
  sizeLabel: HTMLElement | null
  alphaLabel: HTMLElement | null
  toolPreview: HTMLElement | null
  toolPreviewPopup: HTMLElement | null
  toolPreviewCanvas: HTMLCanvasElement | null
  toolPreviewContext: ExtendedCanvasContext | null
} = {
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
  sizeLabel: null,
  alphaLabel: null,
  toolPreview: null,
  toolPreviewPopup: null,
  toolPreviewCanvas: null,
  toolPreviewContext: null,
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

export const closeParams = () => {
  if (state.paramsTimeout !== false) {
    refs.params?.classList.remove('params-container-visible')
    clearTimeout(state.paramsTimeout)
    state.paramsTimeout = false
    state.currentParamsProp = ''
  }
}

const updateToolPreview = () => {
  previewRafPending = false
  if (!refs.toolPreviewContext || !state.currentToolProps) return
  const toolsProps = {
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
  const previewSteps = getStepsDataFromTouchEvents(state.toolPreviewTouchEvents, toolsProps)

  drawMultipleSteps(refs.toolPreviewContext, previewSteps, toolsProps)
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
    refs.slider.style.background = `linear-gradient(90deg, var(--palette-green-1) ${value}%, var(--palette-white) ${value}%)`
  }
  if (refs.sliderLabel) refs.sliderLabel.innerHTML = `${value}`
}

const onSliderDrag = (value: number, inProgress: boolean) => {
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
    Tools.setCurrentToolCustomProps({
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
    Tools.setCurrentToolCustomProps({
      alpha: alphaValue,
    })
  }
}

const onSizeSingleTap = () => {
  if (state.currentParamsProp === 'size') {
    toggleParams()
  } else {
    updateParams(state.sizePerc)
    openParams()
    state.currentParamsProp = 'size'
  }
}

const onAlphaSingleTap = () => {
  if (state.currentParamsProp === 'alpha') {
    toggleParams()
  } else {
    updateParams(state.alphaPerc)
    openParams()
    state.currentParamsProp = 'alpha'
  }
}

const onSizeTouchStart = (e: any) => {
  preventDefault(e)
  if (!refs.sizeButton?.classList.contains('disabled')) {
    Layers.closeResizeModeIfNeeded()
    cursorButtonTouchStart(
      state.sizePerc,
      getEventCoordX(e),
      updateSize,
      onSizeSingleTap,
      config.slidersWaitingTime
    )
  }
}

const onAlphaTouchStart = (e: any) => {
  preventDefault(e)
  if (!refs.alphaButton?.classList.contains('disabled')) {
    Layers.closeResizeModeIfNeeded()
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

export const setTool = (toolProps: any) => {
  toggleSizeAndAlpha(Boolean(toolProps.hasSizeAndAlpha))
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

export const addOptionButtonsGroup = (
  buttons: HTMLElement[] = [],
  side: 'left' | 'center' | 'right' = 'center'
) => {
  const spacer = createDom('editor-toolbar__spacer')
  const wrapper = createDom('editor-toolbar__options-group')
  for (const button of buttons) {
    button.classList.add('editor-toolbar__button')
    wrapper.appendChild(button)
  }
  if (side === 'left') {
    refs.leftSide?.appendChild(spacer)
    refs.leftSide?.appendChild(wrapper)
  } else if (side === 'center') {
    refs.centerSide?.appendChild(spacer)
    refs.centerSide?.appendChild(wrapper)
  } else if (side === 'right') {
    refs.rightSide?.appendChild(wrapper)
    refs.rightSide?.appendChild(spacer)
  }
}

const initDom = async (container: HTMLElement) => {
  const dom = (await loadTemplate(tplToolbar, {}, container)) as HTMLElement[]
  refs.container = dom[0]
  refs.params = dom[1]
  refs.toolPreview = dom[2]
  refs.leftSide = refs.container.querySelector('.editor-toolbar__left')
  refs.centerSide = refs.container.querySelector('.editor-toolbar__center')
  refs.rightSide = refs.container.querySelector('.editor-toolbar__right')
  refs.toolPreviewPopup = refs.toolPreview.querySelector('.editor-toolbar__tool-preview-popup')
  refs.toolPreviewCanvas = refs.toolPreview.querySelector('canvas')
  refs.backButton = refs.container.querySelector('.editor__back')
  refs.saveCopyButton = refs.container.querySelector('.editor__save-copy')
  refs.goFullscreenButton = refs.container.querySelector('.editor__go-fullscreen')
  refs.sizeButton = refs.container.querySelector('.editor-toolbar__size')
  refs.alphaButton = refs.container.querySelector('.editor-toolbar__alpha')
  refs.slider = refs.params.querySelector('.editor-toolbar__slider')
  refs.sliderLabel = refs.slider?.querySelector('span') || null
  refs.sliderCursor = refs.slider?.querySelector('div') || null
  refs.sizeLabel = refs.container.querySelector('.editor-toolbar__size span')
  refs.alphaLabel = refs.container.querySelector('.editor-toolbar__alpha span')

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
    refs.saveCopyButton?.addEventListener(Params.eventStart, Editor.saveCopy)
    disableSaveCopy()
  }
  refs.sizeButton?.addEventListener(Params.eventStart, onSizeTouchStart)
  refs.alphaButton?.addEventListener(Params.eventStart, onAlphaTouchStart)
  refs.backButton?.addEventListener(Params.eventStart, Editor.saveAndGoToFolder)
  refs.goFullscreenButton?.addEventListener(Params.eventStart, Editor.toggleFullscreen)
}

export const init = async (container: HTMLElement) => {
  state = deepCopy(initialState)
  previewRafPending = false
  if (Params.isPhone) {
    config.toolPreviewCanvasSize = 30
  }
  state.toolPreviewCanvasSize = round(config.toolPreviewCanvasSize * spacing.ONE_REM, 0)
  await initDom(container)
}

export const remove = async () => {
  state = {}
  previewRafPending = false
  cleanRefs(refs)
}
