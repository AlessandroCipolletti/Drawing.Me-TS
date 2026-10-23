import Params from 'main/Params'
import { TOOL_FRAME_CIRCLE } from 'pages/Editor/constants'
import {
  drawStrokeSample,
  ExtendedCanvasContext,
  getNewContextForCanvas,
  StrokeSample,
  StrokeToolParams,
} from 'utils/canvasUtils'
import { getEventCoordX, getEventCoordY, preventDefault } from 'utils/domUtils'
import { getImageFromUrl } from 'utils/imageUtils'
import { getDistanceBetweenThreePoints, round } from 'utils/mathUtils'
import { addHorizontalDragSliderHandler } from 'utils/uiUtils'

const CUSTOM_FRAME_CANVAS_SIZE = 1024
const FRAME_BRUSH_MIN_PX = 1
const FRAME_BRUSH_MAX_PX = 200

export interface CustomFrameEditorRefs {
  overlay: HTMLElement | null
  canvas: HTMLCanvasElement | null
  sizeSlider: HTMLElement | null
  sizeCursor: HTMLElement | null
  sizeValueLabel: HTMLElement | null
  opacitySlider: HTMLElement | null
  opacityCursor: HTMLElement | null
  opacityValueLabel: HTMLElement | null
  clearBtn: HTMLElement | null
  cancelBtn: HTMLElement | null
  saveBtn: HTMLElement | null
}

export interface CustomFrameEditorController {
  open: (initialBase64?: string) => Promise<void>
  close: () => void
  destroy: () => void
}

const updateSliderVisual = (
  slider: HTMLElement | null,
  cursor: HTMLElement | null,
  label: HTMLElement | null,
  value: number,
  min: number,
  max: number,
  suffix = ''
) => {
  const perc = Math.max(0, Math.min(100, ((value - min) / Math.max(1, max - min)) * 100))
  if (cursor) cursor.style.left = `${perc}%`
  if (slider) {
    slider.style.backgroundImage = `linear-gradient(90deg, var(--palette-gray-1) ${perc}%, var(--palette-gray-6) ${perc}%)`
  }
  if (label) label.textContent = `${round(value, 0)}${suffix}`
}

export const createCustomFrameEditorController = (
  refs: CustomFrameEditorRefs,
  onSave: (base64: string, sourceCanvas: HTMLCanvasElement) => void
): CustomFrameEditorController => {
  let ctx: ExtendedCanvasContext | null = null
  let currentSize = 48
  let currentOpacity = 100
  let isDrawing = false
  let lastX = 0
  let lastY = 0
  let lastMidX = 0
  let lastMidY = 0

  const baseCanvas = document.createElement('canvas')
  const strokeCanvas = document.createElement('canvas')
  baseCanvas.width = CUSTOM_FRAME_CANVAS_SIZE
  baseCanvas.height = CUSTOM_FRAME_CANVAS_SIZE
  strokeCanvas.width = CUSTOM_FRAME_CANVAS_SIZE
  strokeCanvas.height = CUSTOM_FRAME_CANVAS_SIZE
  const baseCtx = getNewContextForCanvas(baseCanvas)
  let strokeCtx: ExtendedCanvasContext | null = null

  if (refs.canvas) {
    refs.canvas.width = CUSTOM_FRAME_CANVAS_SIZE
    refs.canvas.height = CUSTOM_FRAME_CANVAS_SIZE
    ctx = getNewContextForCanvas(refs.canvas)
    strokeCtx = getNewContextForCanvas(strokeCanvas)
  }

  const syncSliders = () => {
    updateSliderVisual(
      refs.sizeSlider,
      refs.sizeCursor,
      refs.sizeValueLabel,
      currentSize,
      FRAME_BRUSH_MIN_PX,
      FRAME_BRUSH_MAX_PX,
      'px'
    )
    updateSliderVisual(
      refs.opacitySlider,
      refs.opacityCursor,
      refs.opacityValueLabel,
      currentOpacity,
      1,
      100,
      '%'
    )
  }

  if (refs.sizeCursor && refs.sizeSlider) {
    addHorizontalDragSliderHandler(
      refs.sizeCursor,
      refs.sizeSlider,
      (val: number) => {
        currentSize = Math.max(FRAME_BRUSH_MIN_PX, Math.min(FRAME_BRUSH_MAX_PX, round(val, 0)))
        syncSliders()
      },
      FRAME_BRUSH_MAX_PX,
      FRAME_BRUSH_MIN_PX,
      false,
      0
    )
  }

  if (refs.opacityCursor && refs.opacitySlider) {
    addHorizontalDragSliderHandler(
      refs.opacityCursor,
      refs.opacitySlider,
      (val: number) => {
        currentOpacity = Math.max(1, Math.min(100, round(val, 0)))
        syncSliders()
      },
      100,
      1,
      false,
      0
    )
  }

  syncSliders()

  const getStampTool = (): StrokeToolParams => ({
    frameType: TOOL_FRAME_CIRCLE,
    color: '#000000',
    size: currentSize,
    minPxDistanceBetweenFrames: 1,
    sizeToFramesRatio: 0.04,
    preserveStampRemainder: true,
  })

  const strokeAlpha = () => round(currentOpacity / 100, 3)

  const present = () => {
    if (!ctx) return
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, CUSTOM_FRAME_CANVAS_SIZE, CUSTOM_FRAME_CANVAS_SIZE)
    ctx.drawImage(baseCanvas, 0, 0)
    ctx.globalAlpha = strokeAlpha()
    ctx.drawImage(strokeCanvas, 0, 0)
    ctx.globalAlpha = 1
  }

  const bakeStroke = () => {
    present()
    baseCtx.globalAlpha = 1
    baseCtx.globalCompositeOperation = 'source-over'
    baseCtx.clearRect(0, 0, CUSTOM_FRAME_CANVAS_SIZE, CUSTOM_FRAME_CANVAS_SIZE)
    if (refs.canvas) baseCtx.drawImage(refs.canvas, 0, 0)
    strokeCtx?.clearRect(0, 0, CUSTOM_FRAME_CANVAS_SIZE, CUSTOM_FRAME_CANVAS_SIZE)
  }

  const getCanvasCoords = (e: Event): [number, number] => {
    if (!refs.canvas) return [0, 0]
    const rect = refs.canvas.getBoundingClientRect()
    const scaleX = CUSTOM_FRAME_CANVAS_SIZE / Math.max(1, rect.width || CUSTOM_FRAME_CANVAS_SIZE)
    const scaleY = CUSTOM_FRAME_CANVAS_SIZE / Math.max(1, rect.height || CUSTOM_FRAME_CANVAS_SIZE)
    const x = round((getEventCoordX(e) - rect.left) * scaleX, 1)
    const y = round((getEventCoordY(e) - rect.top) * scaleY, 1)
    return [x, y]
  }

  const onPointerMove = (e: Event) => {
    if (!isDrawing || !ctx) return
    preventDefault(e)
    e.stopPropagation()
    const [x, y] = getCanvasCoords(e)
    if (x === lastX && y === lastY) return
    const midX = round((lastX + x) / 2, 1)
    const midY = round((lastY + y) / 2, 1)
    const stepLength = getDistanceBetweenThreePoints(
      lastMidX,
      lastMidY,
      lastX,
      lastY,
      midX,
      midY,
      1
    )
    const sample: StrokeSample = {
      type: 'move',
      x,
      y,
      midX,
      midY,
      size: currentSize,
      alpha: 1,
      rotation: 0,
      oldSize: currentSize,
      oldAlpha: 1,
      oldRotation: 0,
      oldMidX: lastMidX,
      oldMidY: lastMidY,
      oldX: lastX,
      oldY: lastY,
      stepLength,
      aspectRatio: 1,
      oldAspectRatio: 1,
    }
    if (strokeCtx) drawStrokeSample(strokeCtx, sample, getStampTool(), false)
    present()
    lastX = x
    lastY = y
    lastMidX = midX
    lastMidY = midY
  }

  const onPointerEnd = (e: Event) => {
    if (!isDrawing) return
    preventDefault(e)
    e.stopPropagation()
    isDrawing = false
    bakeStroke()
    document.removeEventListener(Params.eventMove, onPointerMove)
    document.removeEventListener(Params.eventEnd, onPointerEnd)
  }

  const onPointerStart = (e: Event) => {
    if (!ctx) return
    const evt = e as PointerEvent & TouchEvent
    if (
      (typeof evt.button === 'number' && evt.button > 0) ||
      (evt.touches && evt.touches.length > 1)
    ) {
      return
    }
    preventDefault(e)
    e.stopPropagation()
    isDrawing = true
    if (strokeCtx) {
      strokeCtx.clearRect(0, 0, CUSTOM_FRAME_CANVAS_SIZE, CUSTOM_FRAME_CANVAS_SIZE)
      strokeCtx.lastDrawCoordX = -1
      strokeCtx.lastDrawCoordY = -1
    }
    const [x, y] = getCanvasCoords(e)
    lastX = x
    lastY = y
    lastMidX = x
    lastMidY = y
    const sample: StrokeSample = {
      type: 'start',
      x,
      y,
      midX: x,
      midY: y,
      size: currentSize,
      alpha: 1,
      rotation: 0,
      oldSize: currentSize,
      oldAlpha: 1,
      oldRotation: 0,
      oldMidX: x,
      oldMidY: y,
      oldX: x,
      oldY: y,
      stepLength: 0,
      aspectRatio: 1,
      oldAspectRatio: 1,
    }
    if (strokeCtx) drawStrokeSample(strokeCtx, sample, getStampTool(), false)
    present()
    document.addEventListener(Params.eventMove, onPointerMove)
    document.addEventListener(Params.eventEnd, onPointerEnd)
  }

  const onClearClick = (e: Event) => {
    preventDefault(e)
    e.stopPropagation()
    baseCtx.clearRect(0, 0, CUSTOM_FRAME_CANVAS_SIZE, CUSTOM_FRAME_CANVAS_SIZE)
    strokeCtx?.clearRect(0, 0, CUSTOM_FRAME_CANVAS_SIZE, CUSTOM_FRAME_CANVAS_SIZE)
    present()
  }

  const close = () => {
    refs.overlay?.classList.add('displayNone')
    refs.overlay?.classList.remove('custom-frame-editor--open')
  }

  const onCancelClick = (e: Event) => {
    preventDefault(e)
    e.stopPropagation()
    close()
  }

  const onSaveClick = (e: Event) => {
    preventDefault(e)
    e.stopPropagation()
    if (!refs.canvas) return
    let base64: string
    try {
      base64 = refs.canvas.toDataURL('image/png')
    } catch {
      base64 = ''
    }
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = CUSTOM_FRAME_CANVAS_SIZE
    exportCanvas.height = CUSTOM_FRAME_CANVAS_SIZE
    const exportCtx = exportCanvas.getContext('2d')
    if (exportCtx && refs.canvas) {
      try {
        exportCtx.drawImage(refs.canvas, 0, 0)
      } catch {
        // Ignore in headless test environments
      }
    }
    close()
    onSave(base64, exportCanvas)
  }

  refs.canvas?.addEventListener(Params.eventStart, onPointerStart)
  refs.clearBtn?.addEventListener(Params.eventStart, onClearClick)
  refs.cancelBtn?.addEventListener(Params.eventStart, onCancelClick)
  refs.saveBtn?.addEventListener(Params.eventStart, onSaveClick)

  const open = async (initialBase64?: string) => {
    baseCtx.globalAlpha = 1
    baseCtx.globalCompositeOperation = 'source-over'
    baseCtx.clearRect(0, 0, CUSTOM_FRAME_CANVAS_SIZE, CUSTOM_FRAME_CANVAS_SIZE)
    strokeCtx?.clearRect(0, 0, CUSTOM_FRAME_CANVAS_SIZE, CUSTOM_FRAME_CANVAS_SIZE)
    if (initialBase64 && typeof Image !== 'undefined') {
      try {
        const img = await getImageFromUrl(initialBase64)
        if (img && (img.naturalWidth > 0 || img.width > 0)) {
          baseCtx.drawImage(img, 0, 0, CUSTOM_FRAME_CANVAS_SIZE, CUSTOM_FRAME_CANVAS_SIZE)
        }
      } catch {
        // Ignore invalid base64
      }
    }
    present()
    syncSliders()
    refs.overlay?.classList.remove('displayNone')
    refs.overlay?.classList.add('custom-frame-editor--open')
  }

  return {
    open,
    close,
    destroy: () => {
      refs.canvas?.removeEventListener(Params.eventStart, onPointerStart)
      refs.clearBtn?.removeEventListener(Params.eventStart, onClearClick)
      refs.cancelBtn?.removeEventListener(Params.eventStart, onCancelClick)
      refs.saveBtn?.removeEventListener(Params.eventStart, onSaveClick)
      document.removeEventListener(Params.eventMove, onPointerMove)
      document.removeEventListener(Params.eventEnd, onPointerEnd)
    },
  }
}
