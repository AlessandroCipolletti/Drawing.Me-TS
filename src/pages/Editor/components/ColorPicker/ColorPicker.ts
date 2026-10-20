import './colorPicker.css'

import Params from 'main/Params'
import * as Tools from 'pages/Editor/components/Tools'
import * as Layers from 'pages/Editor/components/Layers'
import { preventDefault, preventDefaultTouchOnEls } from 'utils/domUtils'
import { getHexBrightness } from 'utils/colorsUtils'
import { cleanRefs } from 'utils/moduleUtils'
import { removeOutElement } from 'utils/animationsUtils'
import { editorFacade } from 'pages/Editor/editorFacade'
import {
  addHorizontalDragSliderHandler,
  addListHorizontalScrollClickAndPressHandlers,
} from 'utils/uiUtils'
import { mount } from 'ui/mount'

import { ColorPickerView } from './ColorPickerView'
import {
  addNewColorDom,
  closeParams,
  config,
  confirmLastAddedColorIfNeeded,
  createPaletteColorRecord,
  getCurrentColorsPalette,
  getCurrentSelectedColorId,
  getFinalColorById,
  getRandomColor,
  INITIAL_COLORS,
  labels,
  PaletteColor,
  refs,
  removeLastAddedColorIfNeeded,
  resetColorPickerState,
  startDragColor,
  state,
  toggleParams,
  updateColorBrightness,
  updateColorPalette,
  updateParamsByColor,
} from './colorPickerPalette'

export type { PaletteColor }
export {
  closeParams,
  confirmLastAddedColorIfNeeded,
  getCurrentColorsPalette,
  getCurrentSelectedColorId,
  getRandomColor,
}

const deselectCurrentColor = () => {
  const selected = refs.colorPickerContainer?.querySelector('.editor-colorpicker__color-selected')
  if (selected) {
    selected.classList.remove('editor-colorpicker__color-selected')
  }
}

const resetRandom = () => {
  refs.randomButtom?.classList.remove('editor-colorpicker__random-selected')
  refs.randomButtom?.classList.remove('editor-colorpicker__random-locked')
}

const deselectAll = () => {
  deselectPipette()
  resetRandom()
  deselectCurrentColor()
}

const selectColor = (idColor: number, autoDeselect = true, showParams = true) => {
  if (autoDeselect) {
    deselectAll()
  }
  Layers.closeResizeModeIfNeeded()
  state.lastSelectedColorId = idColor
  updateParamsByColor(idColor, showParams)
  const target = refs.colorsContainer?.querySelector(`div[data-id="${idColor}"]`)
  target?.classList.add('editor-colorpicker__color-selected')
  state.selectedColorId = idColor
  editorFacade.setToolColor(getFinalColorById(idColor), false)
}

const selectRandom = (autoDeselect = true) => {
  if (autoDeselect) {
    deselectAll()
  }
  Layers.closeResizeModeIfNeeded()
  state.selectedColorId = 'random'
  state.lastSelectedColorId = 'random'
  refs.randomButtom?.classList.add('editor-colorpicker__random-selected')
  editorFacade.setToolColor(false, true)
}

export const addPaletteColor = (colorHex: string, autoDeselect = true) => {
  if (autoDeselect) {
    deselectAll()
  }
  const animateNewColor = state.lastAddedColorId === false
  removeLastAddedColorIfNeeded()
  const newColor = createPaletteColorRecord(colorHex)
  state.lastAddedColorId = newColor.id
  state.colors.unshift(newColor)
  addNewColorDom(newColor.id, true, true, animateNewColor)
  selectColor(newColor.id, false)
  if (refs.colorsContainer) refs.colorsContainer.scrollLeft = 0
}

const confirmLastRandomColor = () => {
  if (state.currentRandomColor && state.currentRandomColor !== state.colors[0]?.initialHex) {
    addPaletteColor(state.currentRandomColor)
  }
}

const selectPipette = (autoDeselect = true) => {
  if (!refs.pipetteButtom?.classList.contains('editor-colorpicker__pipette-selected')) {
    if (autoDeselect) {
      deselectAll()
    }
    state.selectedColorId = 'pipette'
    Tools.clickButton('pipette')
    refs.pipetteButtom?.classList.add('editor-colorpicker__pipette-selected')
  }
}

export const deselectPipette = (
  selectLastUsedTool = true,
  showToolChange = false,
  selectLastUsedColor = false
) => {
  if (
    refs.pipetteButtom &&
    refs.pipetteButtom.classList.contains('editor-colorpicker__pipette-selected')
  ) {
    refs.pipetteButtom.classList.remove('editor-colorpicker__pipette-selected')
    editorFacade.hidePipetteCursor()
    if (selectLastUsedTool) {
      Tools.selectLastUsedTool(showToolChange)
    }
    if (selectLastUsedColor) {
      if (state.lastSelectedColorId === 'random') {
        selectRandom(false)
      } else {
        selectColor(Number(state.lastSelectedColorId), false)
      }
    } else if (state.colors.length) {
      selectColor(state.colors[0].id)
    }
  }
}

const onSuggestedColorsTouchStart = (e: Event) => {
  e.preventDefault()
  const target = e.target as HTMLElement | null
  if (target?.classList.contains('editor-colorpicker__color')) {
    const colorHex = target.getAttribute('data-hex')
    if (colorHex) addPaletteColor(colorHex)
  }
}

const onListClick = (e: Event) => {
  const target = e.target as HTMLElement | null
  if (target?.classList.contains('editor-colorpicker__color')) {
    confirmLastAddedColorIfNeeded()
    if (target.classList.contains('editor-colorpicker__color-selected')) {
      toggleParams()
    } else {
      const idColor = parseInt(target.getAttribute('data-id') || '0', 10)
      selectColor(idColor)
    }
  }
}

const onListLongPress = (e: Event) => {
  const target = e.target as HTMLElement | null
  if (state.colors.length > 1) {
    if (target?.classList.contains('editor-colorpicker__color')) {
      selectColor(parseInt(target.getAttribute('data-id') || '0', 10))
      startDragColor(e, target)
    }
  }
}

const onRandomTouchStart = (e: Event) => {
  preventDefault(e)
  closeParams()
  if (state.selectedColorId === 'random') {
    confirmLastRandomColor()
  } else {
    selectRandom()
  }
}

const onPipetteTouchStart = (e: Event) => {
  preventDefault(e)
  closeParams()
  if (state.selectedColorId === 'pipette') {
    deselectPipette(true, true, true)
  } else {
    selectPipette()
  }
}

const onInputChange = (e: Event) => {
  const target = e.target as HTMLInputElement | null
  if (target?.value) {
    addPaletteColor(target.value)
  }
}

const deleteSelectedColor = (e: Event) => {
  preventDefault(e)
  if (Number.isInteger(state.selectedColorId)) {
    closeParams()
    const el = refs.colorsContainer?.querySelector(
      `div[data-id="${state.selectedColorId}"]`
    ) as HTMLElement | null
    if (el) removeOutElement(el)
    state.colors = state.colors.filter((c) => c.id !== state.selectedColorId)
    if (state.lastAddedColorId === state.selectedColorId) {
      state.lastAddedColorId = false
    }
    selectRandom(true)
  }
}

const initDom = async (container: HTMLElement) => {
  mount(
    container,
    ColorPickerView({
      colors: state.colors,
      labels,
      refs,
    })
  )

  if (refs.colorsContainer) {
    addListHorizontalScrollClickAndPressHandlers(refs.colorsContainer, onListClick, onListLongPress)
  }
  refs.input?.addEventListener('input', onInputChange)
  refs.randomButtom?.addEventListener(Params.eventStart, onRandomTouchStart)
  refs.pipetteButtom?.addEventListener(Params.eventStart, onPipetteTouchStart)
  refs.suggestedContainer?.addEventListener(Params.eventStart, onSuggestedColorsTouchStart)
  refs.deleteButton?.addEventListener(Params.eventStart, deleteSelectedColor)
  if (refs.brightnessCursor && refs.brightnessSlider) {
    addHorizontalDragSliderHandler(
      refs.brightnessCursor,
      refs.brightnessSlider,
      updateColorBrightness,
      100,
      0,
      false,
      0
    )
  }

  preventDefaultTouchOnEls(
    refs.colorPickerContainer?.querySelector('.editor-colorpicker__random-container'),
    refs.colorPickerContainer?.querySelector('.editor-colorpicker__pipette-container'),
    refs.brightnessSlider
  )
  refs.colorPickerContainer
    ?.querySelector('.editor-colorpicker__input')
    ?.addEventListener(Params.eventStart, (e: Event) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName?.toLowerCase() !== 'input') {
        preventDefault(e)
      }
    })
}

export const init = async (
  container: HTMLElement,
  drawingColors: PaletteColor[] = [],
  selectedColorId = -1
) => {
  config.initialColors = INITIAL_COLORS.map((c, i) => ({
    id: i,
    initialHex: c,
    brightness: getHexBrightness(c),
    finalHex: c,
  }))
  resetColorPickerState()
  await initDom(container)
  const colors = drawingColors.length ? drawingColors : config.initialColors
  updateColorPalette(colors)

  if (selectedColorId >= 0 && colors.find((c) => c.id === selectedColorId)) {
    selectColor(selectedColorId, true, false)
  } else {
    selectRandom(true)
  }
  if (refs.colorsContainer) refs.colorsContainer.scrollLeft = 0
}

export const remove = async () => {
  closeParams()
  if (state.paramsTimeout) clearTimeout(state.paramsTimeout)
  resetColorPickerState()
  config.initialColors = []
  cleanRefs(refs)
}
