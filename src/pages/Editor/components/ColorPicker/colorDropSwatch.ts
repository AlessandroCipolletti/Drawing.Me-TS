import Params from 'main/Params'
import { editorCalls } from 'pages/Editor/editorCalls'
import { getEventCoordX, getEventCoordY, preventDefault } from 'utils/domUtils'
import { getFinalColorById } from './colorPickerPalette'

const DRAG_OUT_Y_THRESHOLD = 12

export const attachColorDropSwatchHandlers = (colorsContainer: HTMLElement) => {
  let tracking = false
  let startX = 0
  let startY = 0
  let colorHex = ''
  let colorDropStarted = false

  const reset = () => {
    tracking = false
    colorDropStarted = false
    colorHex = ''
  }

  const onMove = (e: Event) => {
    if (!tracking || colorDropStarted) return
    const x = getEventCoordX(e as TouchEvent, 0)
    const y = getEventCoordY(e as TouchEvent, 0)
    const dy = y - startY
    const dx = x - startX
    const threshold = DRAG_OUT_Y_THRESHOLD * Params.pxScale
    if (dy < -threshold && Math.abs(dy) > Math.abs(dx)) {
      colorDropStarted = true
      preventDefault(e)
      e.stopPropagation()
      editorCalls.cancelColorPickerLongPress?.()
      editorCalls.beginColorDropFromSwatch?.(colorHex, x, y)
    }
  }

  const onEnd = () => {
    document.removeEventListener(Params.eventMove, onMove, true)
    document.removeEventListener(Params.eventEnd, onEnd, true)
    if (Params.eventCanceled) {
      document.removeEventListener(Params.eventCanceled, onEnd, true)
    }
    reset()
  }

  colorsContainer.addEventListener(
    Params.eventStart,
    (e) => {
      const target = e.target as HTMLElement | null
      if (!target?.classList.contains('editor-colorpicker__color')) return
      if (editorCalls.isColorDropActive?.()) return
      const id = parseInt(target.getAttribute('data-id') || '0', 10)
      colorHex = getFinalColorById(id)
      if (!colorHex) return
      tracking = true
      colorDropStarted = false
      startX = getEventCoordX(e as TouchEvent, 0)
      startY = getEventCoordY(e as TouchEvent, 0)
      document.addEventListener(Params.eventMove, onMove, { capture: true, passive: false })
      document.addEventListener(Params.eventEnd, onEnd, { capture: true, passive: false })
      if (Params.eventCanceled) {
        document.addEventListener(Params.eventCanceled, onEnd, { capture: true, passive: false })
      }
    },
    { capture: true }
  )
}
