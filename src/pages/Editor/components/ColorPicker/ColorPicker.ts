import tplColorPicker from './colorPicker.tpl?raw'
import './colorPicker.css'

import Params from 'main/Params'
import * as Tools from 'pages/Editor/components/Tools'
import * as Layers from 'pages/Editor/components/Layers'
import { preventDefault, preventDefaultTouchOnEls, loadTemplate, createDom } from 'utils/domUtils'
import {
  applyBrightnessToHex,
  getHexBrightness,
  getSuggestedColors,
  getRandomHexColor,
} from 'utils/colorsUtils'
import { cleanRefs } from 'utils/moduleUtils'
import { addInElement, removeOutElement } from 'utils/animationsUtils'
import { setToolColor, saveDrawingsPalette, hidePipetteCursor } from 'pages/Editor'
import {
  addHorizontalDragSliderHandler,
  addListHorizontalScrollClickAndPressHandlers,
  handleElementsListDragAndDrop,
} from 'utils/uiUtils'
import { shiftArrayElement, deepCopy } from 'utils/jsUtils'

const INITIAL_COLORS = [
  '#000000',
  '#FFFFFF',
  '#FFB6C1',
  '#FF1493',
  '#FF00FF',
  '#9400D3',
  '#4B0082',
  '#F08080',
  '#FF0000',
  '#8B0000',
  '#FF8C00',
  '#FF6347',
  '#FFFF00',
  '#FFD700',
  '#90EE90',
  '#008000',
  '#66CDAA',
  '#40E0D0',
  '#00FFFF',
  '#0000FF',
  '#191970',
  '#808000',
  '#8B4513',
  '#FFFFF0',
  '#808080',
  '#778899',
]

export interface PaletteColor {
  id: number
  initialHex: string
  brightness: number
  finalHex: string
}

const config: {
  initialColors: PaletteColor[]
  paramsCloseDelay: number
} = {
  initialColors: [],
  paramsCloseDelay: 7 * 1000,
}

let state: Record<string, any> = {}
const initialState = {
  colors: [] as PaletteColor[],
  lastAddedColorId: false as number | false,
  lastSelectedColorId: 'random' as number | string,
  selectedColorId: 'random' as number | string,
  paramsTimeout: false as ReturnType<typeof setTimeout> | false,
  currentRandomColor: '',
}

const refs: {
  colorPickerContainer: HTMLElement | null
  randomButtom: HTMLElement | null
  pipetteButtom: HTMLElement | null
  colorsContainer: HTMLElement | null
  input: HTMLInputElement | null
  paramsContainer: HTMLElement | null
  brightnessSlider: HTMLElement | null
  brightnessCursor: HTMLElement | null
  brightnessLabel: HTMLElement | null
  suggestedContainer: HTMLElement | null
  deleteButton: HTMLElement | null
} = {
  colorPickerContainer: null,
  randomButtom: null,
  pipetteButtom: null,
  colorsContainer: null,
  input: null,
  paramsContainer: null,
  brightnessSlider: null,
  brightnessCursor: null,
  brightnessLabel: null,
  suggestedContainer: null,
  deleteButton: null,
}

const labels = {
  brightness: 'Brightness:',
  suggested: 'Suggested:',
}

const updateColorPalette = (colors: PaletteColor[]) => {
  colors.forEach((color) => {
    state.colors.push(color)
    addNewColorDom(color.id)
  })
}

const addNewColorDom = (idColor: number, selected = false, prepend = false, animate = false) => {
  const newColorElement = selected
    ? createDom('editor-colorpicker__color', 'editor-colorpicker__color-selected')
    : createDom('editor-colorpicker__color')
  newColorElement.setAttribute('data-id', String(idColor))
  newColorElement.style.backgroundColor = getFinalColorById(idColor)
  if (prepend) {
    refs.colorsContainer?.prepend(newColorElement)
  } else {
    refs.colorsContainer?.append(newColorElement)
  }
  if (animate) {
    addInElement(newColorElement, { commitResult: false })
  }
}

export const addPaletteColor = (colorHex: string, autoDeselect = true) => {
  if (autoDeselect) {
    deselectAll()
  }
  const animateNewColor = state.lastAddedColorId === false
  removeLastAddedColorIfNeeded()
  const newColor: PaletteColor = {
    id: 1000 + state.colors.length,
    initialHex: colorHex,
    brightness: getHexBrightness(colorHex),
    finalHex: colorHex,
  }
  state.lastAddedColorId = newColor.id
  state.colors.unshift(newColor)
  addNewColorDom(newColor.id, true, true, animateNewColor)
  selectColor(newColor.id, false)
  if (refs.colorsContainer) refs.colorsContainer.scrollLeft = 0
}

const toggleParams = () => {
  if (refs.paramsContainer?.classList.contains('params-container-visible')) {
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
  refs.paramsContainer?.classList.add('params-container-visible')
}

export const closeParams = () => {
  if (state.paramsTimeout !== false) {
    refs.paramsContainer?.classList.remove('params-container-visible')
    clearTimeout(state.paramsTimeout)
    state.paramsTimeout = false
  }
}

const getFinalColorById = (idColor: number): string =>
  state.colors.find((c: PaletteColor) => c.id === idColor)?.finalHex || '#000000'

const updateParamsByColor = (idColor: number, showParams = true) => {
  if (Number.isInteger(idColor)) {
    if (showParams) {
      openParams()
    }
    const color = state.colors.find((c: PaletteColor) => c.id === idColor)
    if (!color) return

    if (refs.brightnessLabel) refs.brightnessLabel.innerHTML = String(color.brightness)
    if (refs.brightnessCursor) refs.brightnessCursor.style.left = `${color.brightness}%`
    const gradientMiddleColor = applyBrightnessToHex(color.initialHex, 50)
    if (refs.brightnessSlider) {
      refs.brightnessSlider.style.background = `linear-gradient(to right, #000000 0%, ${gradientMiddleColor} 50%, #ffffff 100%)`
    }

    updateSuggestedColorByHex(color.finalHex)
  }
}

const updateSuggestedColorByHex = (hex: string) => {
  if (!refs.suggestedContainer) return
  refs.suggestedContainer.innerHTML = ''
  const suggestedColors = getSuggestedColors(hex)
  suggestedColors.forEach((c) => {
    const newColorElement = createDom('editor-colorpicker__color')
    newColorElement.style.backgroundColor = c
    newColorElement.setAttribute('data-hex', c)
    refs.suggestedContainer?.appendChild(newColorElement)
  })
}

const onSuggestedColorsTouchStart = (e: any) => {
  e.preventDefault()
  if (e.target.classList.contains('editor-colorpicker__color')) {
    const colorHex = e.target.getAttribute('data-hex')
    if (colorHex) addPaletteColor(colorHex)
  }
}

const updateColorBrightness = (brightness: number) => {
  let finalHex = '#000000'
  openParams()
  state.colors = state.colors.map((c: PaletteColor) => {
    if (c.id === state.selectedColorId) {
      finalHex = applyBrightnessToHex(c.initialHex, brightness)
      c.brightness = brightness
      c.finalHex = finalHex
    }
    return c
  })
  updateSuggestedColorByHex(finalHex)
  if (refs.brightnessCursor) refs.brightnessCursor.style.left = `${brightness}%`
  if (refs.brightnessLabel) refs.brightnessLabel.innerHTML = `${brightness}`
  const target = refs.colorsContainer?.querySelector(
    `div[data-id="${state.selectedColorId}"]`
  ) as HTMLElement | null
  if (target) target.style.backgroundColor = finalHex
  setToolColor(finalHex, false)
}

const removeLastAddedColorIfNeeded = () => {
  if (state.lastAddedColorId) {
    document.querySelector(`div[data-id="${state.lastAddedColorId}"]`)?.remove()
    state.colors = state.colors.filter((c: PaletteColor) => c.id !== state.lastAddedColorId)
    state.lastAddedColorId = false
  }
}

const confirmLastRandomColor = () => {
  if (state.currentRandomColor && state.currentRandomColor !== state.colors[0]?.initialHex) {
    addPaletteColor(state.currentRandomColor)
  }
}

export const confirmLastAddedColorIfNeeded = () => {
  if (state.lastAddedColorId) {
    saveDrawingsPalette(state.colors)
    state.lastAddedColorId = false
  }
}

export const getCurrentColorsPalette = (): PaletteColor[] => state.colors

export const getCurrentSelectedColorId = (): number =>
  parseInt(String(state.selectedColorId), 10) || -1

export const getRandomColor = (): string => {
  state.currentRandomColor = getRandomHexColor()
  return state.currentRandomColor
}

const deselectAll = () => {
  deselectPipette()
  resetRandom()
  deselectCurrentColor()
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
  setToolColor(getFinalColorById(idColor), false)
}

const selectRandom = (autoDeselect = true) => {
  if (autoDeselect) {
    deselectAll()
  }
  Layers.closeResizeModeIfNeeded()
  state.selectedColorId = 'random'
  state.lastSelectedColorId = 'random'
  refs.randomButtom?.classList.add('editor-colorpicker__random-selected')
  setToolColor(false, true)
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
    hidePipetteCursor()
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

const reorderColorsList = () => {
  state.colors.forEach((color: PaletteColor) => {
    const el = refs.colorsContainer?.querySelector(`div[data-id="${color.id}"]`)
    if (el) refs.colorsContainer?.appendChild(el)
  })
}

const onDragChange = (draggedElement: HTMLElement, newIndex: number) => {
  const idColor = parseInt(draggedElement.getAttribute('data-id') || '0', 10)
  const currentIndex = state.colors.findIndex((c: PaletteColor) => c.id === idColor)
  shiftArrayElement(state.colors, currentIndex, newIndex)
  reorderColorsList()
}

const startDragColor = (e: any, colorDom: HTMLElement) => {
  closeParams()
  preventDefault(e)
  if (refs.colorsContainer) {
    handleElementsListDragAndDrop(e, refs.colorsContainer, colorDom, onDragChange, 'horizontal')
  }
}

const onListClick = (e: any) => {
  if (e.target.classList.contains('editor-colorpicker__color')) {
    confirmLastAddedColorIfNeeded()
    if (e.target.classList.contains('editor-colorpicker__color-selected')) {
      toggleParams()
    } else {
      const idColor = parseInt(e.target.getAttribute('data-id'), 10)
      selectColor(idColor)
    }
  }
}

const onListLongPress = (e: any) => {
  if (state.colors.length > 1) {
    if (e.target.classList.contains('editor-colorpicker__color')) {
      selectColor(parseInt(e.target.getAttribute('data-id'), 10))
      startDragColor(e, e.target)
    }
  }
}

const onRandomTouchStart = (e: any) => {
  preventDefault(e)
  closeParams()
  if (state.selectedColorId === 'random') {
    confirmLastRandomColor()
  } else {
    selectRandom()
  }
}

const onPipetteTouchStart = (e: any) => {
  preventDefault(e)
  closeParams()
  if (state.selectedColorId === 'pipette') {
    deselectPipette(true, true, true)
  } else {
    selectPipette()
  }
}

const onInputChange = (e: any) => {
  addPaletteColor(e.target.value)
}

const deleteSelectedColor = (e: any) => {
  preventDefault(e)
  if (Number.isInteger(state.selectedColorId)) {
    closeParams()
    const el = refs.colorsContainer?.querySelector(
      `div[data-id="${state.selectedColorId}"]`
    ) as HTMLElement | null
    if (el) removeOutElement(el)
    state.colors = state.colors.filter((c: PaletteColor) => c.id !== state.selectedColorId)
    if (state.lastAddedColorId === state.selectedColorId) {
      state.lastAddedColorId = false
    }
    selectRandom(true)
  }
}

const initDom = async (container: HTMLElement) => {
  const dom = (await loadTemplate(
    tplColorPicker,
    {
      colors: state.colors,
      labels,
    },
    container
  )) as HTMLElement[]
  refs.colorPickerContainer = dom[0]
  refs.randomButtom = refs.colorPickerContainer.querySelector('.editor-colorpicker__random')
  refs.pipetteButtom = refs.colorPickerContainer.querySelector('.editor-colorpicker__pipette')
  refs.colorsContainer = refs.colorPickerContainer.querySelector(
    '.editor-colorpicker__colors-container'
  )
  refs.input = refs.colorPickerContainer.querySelector('.editor-colorpicker__input-container input')
  refs.paramsContainer = dom[1]
  refs.brightnessSlider = refs.paramsContainer.querySelector(
    '.editor-colorpicker__brightness-slider'
  )
  refs.brightnessCursor = refs.paramsContainer.querySelector(
    '.editor-colorpicker__brightness-slider div'
  )
  refs.brightnessLabel = refs.paramsContainer.querySelector(
    '.editor-colorpicker__brightness-slider div span'
  )
  refs.suggestedContainer = refs.paramsContainer.querySelector(
    '.editor-colorpicker__suggested-container'
  )
  refs.deleteButton = refs.paramsContainer.querySelector('.editor-colorpicker__delete-button')

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
    refs.colorPickerContainer.querySelector('.editor-colorpicker__random-container'),
    refs.colorPickerContainer.querySelector('.editor-colorpicker__pipette-container'),
    refs.brightnessSlider
  )
  refs.colorPickerContainer
    .querySelector('.editor-colorpicker__input')
    ?.addEventListener(Params.eventStart, (e: any) => {
      if (e.target.tagName.toLowerCase() !== 'input') {
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
  state = deepCopy(initialState)
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
  state = {}
  config.initialColors = []
  cleanRefs(refs)
}
