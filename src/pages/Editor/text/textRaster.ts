import Params from 'main/Params'
import { getNumberInBetween } from 'utils/mathUtils'
import { layoutTextSpec, type TextLayoutResult } from './textLayout'
import {
  buildCanvasFontString,
  normalizeTextHex,
  TEXT_EDIT_PLACEHOLDER,
  type TextBoxBounds,
  type TextSpec,
} from './textSpec'

export interface PaintTextSpecOptions {
  clearTarget?: boolean
  placeholderWhenEmpty?: string
}

const drawLineWithLetterSpacing = (
  ctx: CanvasRenderingContext2D,
  lineText: string,
  startX: number,
  baselineY: number,
  letterSpacing: number,
  mode: 'fill' | 'stroke'
) => {
  if (!lineText) return
  if (Math.abs(letterSpacing) < 0.05) {
    if (mode === 'stroke') {
      ctx.strokeText(lineText, startX, baselineY)
    } else {
      ctx.fillText(lineText, startX, baselineY)
    }
    return
  }
  let cursorX = startX
  for (const ch of Array.from(lineText)) {
    if (mode === 'stroke') {
      ctx.strokeText(ch, cursorX, baselineY)
    } else {
      ctx.fillText(ch, cursorX, baselineY)
    }
    const adv = typeof ctx.measureText === 'function' ? ctx.measureText(ch)?.width || 0 : 0
    cursorX += adv + letterSpacing
  }
}

export const paintTextSpecOnContext = (
  ctx: CanvasRenderingContext2D | null | undefined,
  spec: TextSpec,
  options?: PaintTextSpecOptions
): TextLayoutResult | null => {
  if (!ctx?.canvas) return null
  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  if (cw <= 0 || ch <= 0) return null

  if (options?.clearTarget) {
    ctx.save()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, cw, ch)
    ctx.restore()
  }

  const effectiveText = spec.text.length > 0 ? spec.text : (options?.placeholderWhenEmpty ?? '')
  const renderSpec: TextSpec = effectiveText === spec.text ? spec : { ...spec, text: effectiveText }

  const layout = layoutTextSpec(renderSpec, ctx)
  if (!effectiveText) {
    return layout
  }

  const { boxBounds, lines, lineStepPx, totalTextHeight } = layout
  const isPlaceholder = spec.text.length === 0 && Boolean(options?.placeholderWhenEmpty)
  const alpha = getNumberInBetween(0.05, 1, spec.opacity, 3) * (isPlaceholder ? 0.38 : 1)

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = 'source-over'

  ctx.translate(boxBounds.cx, boxBounds.cy)
  if (spec.rotation) {
    ctx.rotate(spec.rotation)
  }
  if (spec.flipX || spec.flipY) {
    ctx.scale(spec.flipX ? -1 : 1, spec.flipY ? -1 : 1)
  }
  ctx.translate(-boxBounds.cx, -boxBounds.cy)

  ctx.font = buildCanvasFontString(renderSpec)
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  let vOffset = 0
  if (renderSpec.vAlign === 'middle') {
    vOffset = Math.max(0, (boxBounds.height - totalTextHeight) / 2)
  } else if (renderSpec.vAlign === 'bottom') {
    vOffset = Math.max(0, boxBounds.height - totalTextHeight)
  }

  const fillHex = normalizeTextHex(renderSpec.color, '#000000')
  const strokeHex = normalizeTextHex(renderSpec.strokeColor, '#ffffff')
  const hasShadow =
    renderSpec.shadowBlur > 0 || renderSpec.shadowOffsetX !== 0 || renderSpec.shadowOffsetY !== 0

  for (const line of lines) {
    let lineX = renderSpec.x
    if (renderSpec.align === 'center') {
      lineX = renderSpec.x + (renderSpec.width - line.width) / 2
    } else if (renderSpec.align === 'right') {
      lineX = renderSpec.x + Math.max(0, renderSpec.width - line.width)
    }
    const lineY = renderSpec.y + vOffset + line.yOffset + (lineStepPx - renderSpec.fontSize) * 0.35

    if (renderSpec.strokeWidth > 0) {
      ctx.save()
      if (hasShadow) {
        ctx.shadowColor = normalizeTextHex(renderSpec.shadowColor, '#000000')
        ctx.shadowBlur = Math.max(0, renderSpec.shadowBlur)
        ctx.shadowOffsetX = renderSpec.shadowOffsetX
        ctx.shadowOffsetY = renderSpec.shadowOffsetY
      }
      ctx.lineWidth = renderSpec.strokeWidth * 2
      ctx.strokeStyle = strokeHex
      drawLineWithLetterSpacing(ctx, line.text, lineX, lineY, renderSpec.letterSpacing, 'stroke')
      ctx.restore()
    }

    ctx.save()
    if (hasShadow && renderSpec.strokeWidth <= 0) {
      ctx.shadowColor = normalizeTextHex(renderSpec.shadowColor, '#000000')
      ctx.shadowBlur = Math.max(0, renderSpec.shadowBlur)
      ctx.shadowOffsetX = renderSpec.shadowOffsetX
      ctx.shadowOffsetY = renderSpec.shadowOffsetY
    }
    ctx.fillStyle = fillHex
    drawLineWithLetterSpacing(ctx, line.text, lineX, lineY, renderSpec.letterSpacing, 'fill')

    if (line.text && (renderSpec.underline || renderSpec.strike)) {
      const ruleThickness = Math.max(1.5, renderSpec.fontSize * 0.065)
      ctx.fillStyle = fillHex
      if (renderSpec.underline) {
        const uy = lineY + renderSpec.fontSize * 1.04
        ctx.fillRect(lineX, uy, Math.max(4, line.width), ruleThickness)
      }
      if (renderSpec.strike) {
        const sy = lineY + renderSpec.fontSize * 0.52
        ctx.fillRect(lineX, sy, Math.max(4, line.width), ruleThickness)
      }
    }
    ctx.restore()
  }

  ctx.restore()
  return layout
}

export type TextBoxHandleTarget = 'move' | 'widthRight' | 'widthLeft' | 'rotate'

const getTextBoxHandlePositions = (
  bounds: TextBoxBounds,
  canvasScale = 1
): {
  rightMid: [number, number]
  leftMid: [number, number]
  rotateKnob: [number, number]
  topMid: [number, number]
} => {
  const cos = Math.cos(bounds.rotation || 0)
  const sin = Math.sin(bounds.rotation || 0)
  const toWorld = (lx: number, ly: number): [number, number] => {
    const dx = lx - bounds.cx
    const dy = ly - bounds.cy
    return [bounds.cx + dx * cos - dy * sin, bounds.cy + dx * sin + dy * cos]
  }
  const unit = Math.max(0.5, Params.pxScale / Math.max(0.25, canvasScale || 1))
  const rotDist = unit * 26
  return {
    rightMid: toWorld(bounds.x + bounds.width, bounds.cy),
    leftMid: toWorld(bounds.x, bounds.cy),
    topMid: toWorld(bounds.cx, bounds.y),
    rotateKnob: toWorld(bounds.cx, bounds.y - rotDist),
  }
}

export const hitTestTextBoxHandle = (
  px: number,
  py: number,
  bounds: TextBoxBounds,
  canvasScale = 1
): TextBoxHandleTarget | null => {
  const unit = Math.max(0.5, Params.pxScale / Math.max(0.25, canvasScale || 1))
  const hitR = unit * 22
  const handles = getTextBoxHandlePositions(bounds, canvasScale)
  if (Math.hypot(px - handles.rotateKnob[0], py - handles.rotateKnob[1]) <= hitR) {
    return 'rotate'
  }
  if (Math.hypot(px - handles.rightMid[0], py - handles.rightMid[1]) <= hitR) {
    return 'widthRight'
  }
  if (Math.hypot(px - handles.leftMid[0], py - handles.leftMid[1]) <= hitR) {
    return 'widthLeft'
  }
  const dx = px - bounds.cx
  const dy = py - bounds.cy
  const cos = Math.cos(-(bounds.rotation || 0))
  const sin = Math.sin(-(bounds.rotation || 0))
  const lx = dx * cos - dy * sin + bounds.cx
  const ly = dx * sin + dy * cos + bounds.cy
  if (
    lx >= bounds.x - unit * 8 &&
    lx <= bounds.x + bounds.width + unit * 8 &&
    ly >= bounds.y - unit * 8 &&
    ly <= bounds.y + bounds.height + unit * 8
  ) {
    return 'move'
  }
  return null
}

export const renderTextEditOverlay = (
  overlayCanvas: HTMLCanvasElement | null,
  spec: TextSpec,
  canvasScale: number,
  clipMaskCanvas?: HTMLCanvasElement | null
): TextLayoutResult | null => {
  if (!overlayCanvas) return null
  const ctx = overlayCanvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
  overlayCanvas.classList.remove('displayNone')

  const layout = paintTextSpecOnContext(ctx, spec, {
    clearTarget: false,
    placeholderWhenEmpty: TEXT_EDIT_PLACEHOLDER,
  })
  if (!layout) return null

  if (clipMaskCanvas && clipMaskCanvas.width > 0 && clipMaskCanvas.height > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'destination-in'
    ctx.globalAlpha = 1
    ctx.drawImage(clipMaskCanvas, 0, 0)
    ctx.restore()
  }

  const { boxBounds } = layout
  const unit = Math.max(0.5, Params.pxScale / Math.max(0.25, canvasScale || 1))
  const handles = getTextBoxHandlePositions(boxBounds, canvasScale)

  ctx.save()
  ctx.translate(boxBounds.cx, boxBounds.cy)
  if (boxBounds.rotation) ctx.rotate(boxBounds.rotation)
  ctx.translate(-boxBounds.cx, -boxBounds.cy)

  if (typeof ctx.setLineDash === 'function') {
    ctx.setLineDash([unit * 5, unit * 4])
  }
  ctx.lineWidth = unit * 2
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.78)'
  ctx.strokeRect(boxBounds.x, boxBounds.y, boxBounds.width, boxBounds.height)

  if (typeof ctx.setLineDash === 'function') {
    ctx.setLineDash([])
  }
  ctx.lineWidth = unit * 1.1
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.strokeRect(boxBounds.x, boxBounds.y, boxBounds.width, boxBounds.height)
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(handles.topMid[0], handles.topMid[1])
  ctx.lineTo(handles.rotateKnob[0], handles.rotateKnob[1])
  ctx.lineWidth = unit * 1.8
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.78)'
  ctx.stroke()
  ctx.restore()

  const drawKnob = (pt: [number, number], fill: string) => {
    if (typeof ctx.arc !== 'function') return
    ctx.save()
    ctx.beginPath()
    ctx.arc(pt[0], pt[1], unit * 6.5, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = unit * 2
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)'
    ctx.stroke()
    ctx.restore()
  }

  drawKnob(handles.leftMid, '#ffffff')
  drawKnob(handles.rightMid, '#ffffff')
  drawKnob(handles.rotateKnob, '#ff6b4a')

  return layout
}
