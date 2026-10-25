import Params from 'main/Params'
import * as ColorPicker from './components/ColorPicker'
import * as Toolbar from './components/Toolbar'
import * as Layers from './components/Layers'
import * as Tools from './components/Tools'
import { preventDefault } from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import { round, getOriginalCoordsFromScaleRotation } from 'utils/mathUtils'
import { rgbToHex } from 'utils/colorsUtils'
import { getCanvasColorAtPx } from 'utils/canvasUtils'
import { isCanvasZoomed } from './editorViewport'
import { EditorRefs } from './EditorView'
import { EditorCanvasState, EditorState } from './editorTypes'

const goFullscreen = (state: EditorState, e?: Event) => {
  if (e) preventDefault(e)
  if (state.fullscreenActive) {
    return
  }
  state.fullscreenActive = true
  addGlobalStatus('drawith__EDITOR-FULLSCREEN')
  ColorPicker.closeParams()
  Tools.closeVersions()
  Layers.closeParams()
  Toolbar.closeParams()
}

const exitFullscreen = (state: EditorState, e?: Event) => {
  if (e) preventDefault(e)
  if (!state.fullscreenActive) {
    return
  }
  state.fullscreenActive = false
  removeGlobalStatus('drawith__EDITOR-FULLSCREEN')
}

export const toggleFullscreen = (state: EditorState, e?: Event) => {
  if (state.fullscreenActive) {
    exitFullscreen(state, e)
  } else {
    goFullscreen(state, e)
  }
}

export const handleEditorKeyDown = (state: EditorState, e: KeyboardEvent) => {
  const activeTag = (document.activeElement as HTMLElement | null)?.tagName?.toLowerCase()
  if (activeTag === 'input' || activeTag === 'textarea') {
    return
  }
  if (document.body.classList.contains('drawith__MESSAGE-OPEN')) {
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    preventDefault(e)
    if (e.shiftKey) {
      Layers.redoLayers()
    } else {
      Layers.undoLayers()
    }
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
    preventDefault(e)
    Layers.redoLayers()
  } else if (e.key === 'Escape') {
    if (state.fullscreenActive) {
      exitFullscreen(state)
    } else if (state.resizeMode?.active) {
      Layers.closeResizeModeIfNeeded()
    } else {
      ColorPicker.closeParams()
      Tools.closeVersions()
      Layers.closeParams()
      Toolbar.closeParams()
    }
  }
}

export const updatePipette = (
  state: EditorState,
  refs: EditorRefs,
  coordsAreInsideLayer: (x: number, y: number) => boolean,
  canvasX: number,
  canvasY: number,
  domX: string,
  domY: string
) => {
  if (!refs.pipetteCursor || !refs.pipetteBackground) return
  refs.pipetteCursor.style.left = `${domX}`
  refs.pipetteCursor.style.top = `${domY}`

  if (coordsAreInsideLayer(canvasX, canvasY)) {
    if (state.pipette.isOnCanvas === false) {
      refs.pipetteBackground.style.backgroundImage = `url(${state.pipette.bg})`
    }
    state.pipette.isOnCanvas = true
    const bgX = canvasX * 2 * state.canvas.scale
    const bgY = canvasY * 2 * state.canvas.scale
    refs.pipetteBackground.style.backgroundPosition = `calc(-${bgX}px + (14rem * 0.4)) calc(-${bgY}px + (14rem * 0.4))`
    refs.pipetteBackground.style.backgroundSize = `${state.canvas.width * 2 * state.canvas.scale}px ${state.canvas.height * 2 * state.canvas.scale}px`
    refs.pipetteBackground.style.transform = `translate3d(-50%, -50%, 0px) rotate3d(0, 0, 1, ${state.canvas.rotation}deg)`
    const color = getCanvasColorAtPx(
      state.pipette.context!,
      canvasX,
      canvasY,
      state.canvas.width,
      state.canvas.height
    )
    if (color.a || color.r || color.g || color.b) {
      const hexColor = rgbToHex(color.r, color.g, color.b, round(color.a / 255, 4))
      state.pipette.currentColor = hexColor
      refs.pipetteCursor.style.backgroundColor = hexColor
    } else {
      state.pipette.currentColor = false
      refs.pipetteCursor.style.backgroundColor = 'var(--palette-white)'
    }
  } else {
    state.pipette.isOnCanvas = false
    refs.pipetteBackground.style.backgroundImage = 'none'
    state.pipette.currentColor = false
    refs.pipetteCursor.style.backgroundColor = 'var(--palette-white)'
  }
}

export const initPipetteCursor = async (
  state: EditorState,
  initialCanvas: EditorCanvasState,
  refs: EditorRefs,
  coordsAreInsideLayer: (x: number, y: number) => boolean
) => {
  if (!refs.pipetteCursor || !refs.pipetteBackground) return
  state.pipette.isOnCanvas = true
  state.pipette.bg = 'none'
  state.pipette.currentColor = false
  refs.pipetteCursor.style.backgroundColor = 'var(--palette-white)'
  refs.pipetteBackground.style.backgroundImage = 'none'
  state.pipette.context = null

  refs.pipetteCursor.style.left = `calc(${(state.canvas.width / 2 / Params.pxScale) * state.canvas.initialScale + state.canvas.offset.left}px)`
  refs.pipetteCursor.style.top = `calc(${(state.canvas.height / 2 / Params.pxScale) * state.canvas.initialScale + state.canvas.offset.top}px)`

  fadeInElements(refs.pipetteCursor)
  state.pipette.isVisible = true
  let initialX = (state.canvas.width / 2) * state.canvas.initialScale
  let initialY = (state.canvas.height / 2) * state.canvas.initialScale

  if (isCanvasZoomed(state, initialCanvas)) {
    ;[initialX, initialY] = getOriginalCoordsFromScaleRotation(
      initialX,
      initialY,
      state.canvas.originCoordX,
      state.canvas.originCoordY,
      state.canvas.scale,
      state.canvas.rotation
    )
  }

  Layers.exportWholeCanvasData(true).then((rawImageData) => {
    const currentImageData = rawImageData as {
      base64?: string
      context?: CanvasRenderingContext2D
    }
    if (!refs.pipetteBackground) return
    state.pipette.bg = currentImageData.base64 || 'none'
    refs.pipetteBackground.style.backgroundImage = `url(${currentImageData.base64})`
    state.pipette.context = currentImageData.context || null

    updatePipette(
      state,
      refs,
      coordsAreInsideLayer,
      initialX,
      initialY,
      `calc(${(state.canvas.width / 2 / Params.pxScale) * state.canvas.initialScale + state.canvas.offset.left}px)`,
      `calc(${(state.canvas.height / 2 / Params.pxScale) * state.canvas.initialScale + state.canvas.offset.top}px)`
    )
  })
}

export const hidePipetteCursor = async (state: EditorState, refs: EditorRefs) => {
  state.pipette.currentColor = false
  if (refs.pipetteCursor) {
    await fadeOutElements(refs.pipetteCursor)
  }
  state.pipette.isVisible = false
  state.pipette.bg = 'none'
  if (state.pipette.context?.canvas) {
    state.pipette.context.canvas.width = state.pipette.context.canvas.height = 0
  }
  state.pipette.context = null
}

export const closePipetteCursor = async (state: EditorState) => {
  if (state.pipette.currentColor) {
    ColorPicker.addPaletteColor(state.pipette.currentColor, false)
    ColorPicker.confirmLastAddedColorIfNeeded()
  }
  ColorPicker.deselectPipette(true, true, !state.pipette.currentColor)
}
