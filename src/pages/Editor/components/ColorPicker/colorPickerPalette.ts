import { preventDefault, createDom } from 'utils/domUtils'
import {
  applyBrightnessToHex,
  getHexBrightness,
  swatchNeedsDarkRing,
  getSuggestedColors,
  getRandomHexColor,
} from 'utils/colorsUtils'
import { addInElement } from 'utils/animationsUtils'
import { editorFacade } from 'pages/Editor/editorFacade'
import { handleElementsListDragAndDrop } from 'utils/uiUtils'
import { shiftArrayElement, deepCopy } from 'utils/jsUtils'
import { ColorPickerRefs } from './ColorPickerView'

export const INITIAL_COLORS = [
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

export const config: {
  initialColors: PaletteColor[]
  paramsCloseDelay: number
} = {
  initialColors: [],
  paramsCloseDelay: 7 * 1000,
}

export interface ColorPickerState {
  colors: PaletteColor[]
  lastAddedColorId: number | false
  lastSelectedColorId: number | string
  selectedColorId: number | string
  paramsTimeout: ReturnType<typeof setTimeout> | false
  currentRandomColor: string
}

const initialState: ColorPickerState = {
  colors: [],
  lastAddedColorId: false,
  lastSelectedColorId: 'random',
  selectedColorId: 'random',
  paramsTimeout: false,
  currentRandomColor: '',
}

export let state: ColorPickerState = deepCopy(initialState)

export const resetColorPickerState = () => {
  state = deepCopy(initialState)
}

export const refs: ColorPickerRefs = {
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

export const labels = {
  brightness: 'Brightness:',
  suggested: 'Suggested:',
}

export const toggleParams = () => {
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

export const getFinalColorById = (idColor: number): string =>
  state.colors.find((c) => c.id === idColor)?.finalHex || '#000000'

export const addNewColorDom = (
  idColor: number,
  selected = false,
  prepend = false,
  animate = false
) => {
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

export const updateColorPalette = (colors: PaletteColor[]) => {
  colors.forEach((color) => {
    state.colors.push(color)
    addNewColorDom(color.id)
  })
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

export const updateParamsByColor = (idColor: number, showParams = true) => {
  if (Number.isInteger(idColor)) {
    if (showParams) {
      openParams()
    }
    const color = state.colors.find((c) => c.id === idColor)
    if (!color) return

    if (refs.brightnessLabel) refs.brightnessLabel.innerHTML = String(color.brightness)
    if (refs.brightnessCursor) refs.brightnessCursor.style.left = `${color.brightness}%`
    const gradientMiddleColor = applyBrightnessToHex(color.initialHex, 50)
    if (refs.brightnessSlider) {
      refs.brightnessSlider.style.backgroundImage = `linear-gradient(to right, #000000 0%, ${gradientMiddleColor} 50%, #ffffff 100%)`
    }

    updateSuggestedColorByHex(color.finalHex)
  }
}

export const updateColorBrightness = (brightness: number) => {
  let finalHex = '#000000'
  openParams()
  state.colors = state.colors.map((c) => {
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
  if (target) {
    target.style.backgroundColor = finalHex
    target.classList.toggle(
      'editor-colorpicker__color-selected-light',
      swatchNeedsDarkRing(finalHex)
    )
  }
  editorFacade.setToolColor(finalHex, false)
}

export const removeLastAddedColorIfNeeded = () => {
  if (state.lastAddedColorId) {
    ;(
      refs.colorsContainer?.querySelector(`div[data-id="${state.lastAddedColorId}"]`) ||
      document.querySelector(`div[data-id="${state.lastAddedColorId}"]`)
    )?.remove()
    state.colors = state.colors.filter((c) => c.id !== state.lastAddedColorId)
    state.lastAddedColorId = false
  }
}

export const confirmLastAddedColorIfNeeded = () => {
  if (state.lastAddedColorId) {
    editorFacade.saveDrawingsPalette(state.colors)
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

const reorderColorsList = () => {
  state.colors.forEach((color) => {
    const el = refs.colorsContainer?.querySelector(`div[data-id="${color.id}"]`)
    if (el) refs.colorsContainer?.appendChild(el)
  })
}

const onDragChange = (draggedElement: HTMLElement, newIndex: number) => {
  const idColor = parseInt(draggedElement.getAttribute('data-id') || '0', 10)
  const currentIndex = state.colors.findIndex((c) => c.id === idColor)
  shiftArrayElement(state.colors, currentIndex, newIndex)
  reorderColorsList()
}

export const startDragColor = (e: Event, colorDom: HTMLElement) => {
  closeParams()
  preventDefault(e)
  if (refs.colorsContainer) {
    handleElementsListDragAndDrop(e, refs.colorsContainer, colorDom, onDragChange, 'horizontal')
  }
}

export const createPaletteColorRecord = (colorHex: string): PaletteColor => ({
  id: 1000 + state.colors.length,
  initialHex: colorHex,
  brightness: getHexBrightness(colorHex),
  finalHex: colorHex,
})
