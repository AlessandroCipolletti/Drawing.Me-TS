import Params from 'main/Params'
import * as Layers from './components/Layers'
import { getEventCoordX, getEventCoordY, preventDefault } from 'utils/domUtils'
import { EditorState } from './editorTypes'
import * as Coworking from 'modules/Coworking'
import { sendCoworkingBucketFill } from './editorCoworkingBridge'

const COLOR_DROP_GHOST_CLASS = 'editor-colorpicker__color-drop-ghost'

export interface ColorDropControllerDeps {
  state: EditorState
  coordsAreInsideLayer: (x: number, y: number) => boolean
  pageToLayerCoords: (clientX: number, clientY: number) => { x: number; y: number }
  performBucketFill: (
    x: number,
    y: number,
    color: string,
    sendForCoworking?: boolean
  ) => Promise<boolean>
}

export const createColorDropController = (deps: ColorDropControllerDeps) => {
  const { state, coordsAreInsideLayer, pageToLayerCoords, performBucketFill } = deps

  let ghostEl: HTMLElement | null = null
  let docMoveAttached = false

  const onDocumentMove = (e: Event) => {
    preventDefault(e)
    updateColorDropPointer(
      getEventCoordX(e as MouseEvent | TouchEvent, 0),
      getEventCoordY(e as MouseEvent | TouchEvent, 0)
    )
  }

  const onDocumentEnd = (e: Event) => {
    preventDefault(e)
    detachDocumentListeners()
    endColorDropPointer(
      getEventCoordX(e as MouseEvent | TouchEvent, 0),
      getEventCoordY(e as MouseEvent | TouchEvent, 0)
    )
  }

  const attachDocumentListeners = () => {
    if (docMoveAttached) return
    docMoveAttached = true
    document.addEventListener(Params.eventMove, onDocumentMove, { passive: false })
    document.addEventListener(Params.eventEnd, onDocumentEnd, { passive: false })
    if (Params.eventCanceled) {
      document.addEventListener(Params.eventCanceled, onDocumentEnd, { passive: false })
    }
  }

  const detachDocumentListeners = () => {
    if (!docMoveAttached) return
    docMoveAttached = false
    document.removeEventListener(Params.eventMove, onDocumentMove)
    document.removeEventListener(Params.eventEnd, onDocumentEnd)
    if (Params.eventCanceled) {
      document.removeEventListener(Params.eventCanceled, onDocumentEnd)
    }
  }

  const clearGhost = () => {
    ghostEl?.remove()
    ghostEl = null
  }

  const resetColorDropState = () => {
    detachDocumentListeners()
    state.colorDrop.active = false
    state.colorDrop.fillHex = ''
    clearGhost()
  }

  const isBlocked = () =>
    state.currentToolProps.name === 'pipette' ||
    state.resizeMode.active ||
    !state.currentLayerIsActive

  const showGhost = (hex: string, clientX: number, clientY: number) => {
    clearGhost()
    ghostEl = document.createElement('div')
    ghostEl.className = COLOR_DROP_GHOST_CLASS
    ghostEl.style.backgroundColor = hex
    ghostEl.style.left = `${clientX}px`
    ghostEl.style.top = `${clientY}px`
    document.body.appendChild(ghostEl)
  }

  const moveGhost = (clientX: number, clientY: number) => {
    if (!ghostEl) return
    ghostEl.style.left = `${clientX}px`
    ghostEl.style.top = `${clientY}px`
  }

  const beginColorDropFromSwatch = (fillHex: string, clientX: number, clientY: number) => {
    if (isBlocked()) return
    resetColorDropState()
    state.colorDrop.active = true
    state.colorDrop.fillHex = fillHex
    showGhost(fillHex, clientX, clientY)
    attachDocumentListeners()
  }

  const updateColorDropPointer = (clientX: number, clientY: number) => {
    if (!state.colorDrop.active) return
    moveGhost(clientX, clientY)
  }

  const endColorDropPointer = (clientX: number, clientY: number) => {
    if (!state.colorDrop.active) return
    detachDocumentListeners()
    moveGhost(clientX, clientY)

    const { x: layerX, y: layerY } = pageToLayerCoords(clientX, clientY)
    const fillHex = state.colorDrop.fillHex

    if (coordsAreInsideLayer(layerX, layerY)) {
      void performBucketFill(layerX, layerY, fillHex, false).then((used) => {
        if (used && Coworking.isOpen()) {
          const layerId = Layers.getCurrentSelectedLayerId()
          if (layerId) {
            sendCoworkingBucketFill(state, layerId, layerX, layerY, fillHex)
          }
        }
        resetColorDropState()
      })
    } else {
      resetColorDropState()
    }
  }

  const cancelColorDrop = () => {
    resetColorDropState()
  }

  const isColorDropActive = () => state.colorDrop.active

  return {
    beginColorDropFromSwatch,
    updateColorDropPointer,
    endColorDropPointer,
    cancelColorDrop,
    isColorDropActive,
  }
}
