import { getNumberInBetween } from 'utils/mathUtils'

export type TextAlign = 'left' | 'center' | 'right'
type TextVAlign = 'top' | 'middle' | 'bottom'

export const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center', 'right']

export interface TextSpec {
  text: string
  fontFamily: string
  fontWeight: number
  italic: boolean
  fontSize: number
  lineHeight: number
  letterSpacing: number
  align: TextAlign
  vAlign: TextVAlign
  color: string
  opacity: number
  underline: boolean
  strike: boolean
  strokeWidth: number
  strokeColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  shadowColor: string
  x: number
  y: number
  width: number
  widthLocked: boolean
  rotation: number
  flipX: boolean
  flipY: boolean
}

export interface TextBoxBounds {
  x: number
  y: number
  width: number
  height: number
  cx: number
  cy: number
  rotation: number
}

export const DEFAULT_TEXT_FONT_FAMILY = 'Poppins'
export const TEXT_EDIT_PLACEHOLDER = 'Type text…'
export const MIN_TEXT_FONT_SIZE = 10
export const MAX_TEXT_FONT_SIZE = 280
export const MIN_TEXT_BOX_WIDTH = 48

export const normalizeTextHex = (hex: string | false | undefined, fallback = '#000000'): string => {
  if (typeof hex !== 'string') return fallback
  const trimmed = hex.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1]
    const g = trimmed[2]
    const b = trimmed[3]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return fallback
}

const isTextAlign = (v: unknown): v is TextAlign => v === 'left' || v === 'center' || v === 'right'

const isTextVAlign = (v: unknown): v is TextVAlign =>
  v === 'top' || v === 'middle' || v === 'bottom'

export const createDefaultTextSpec = (params?: {
  x?: number
  y?: number
  width?: number
  color?: string | false
  text?: string
  fontSize?: number
}): TextSpec => {
  const color = normalizeTextHex(params?.color, '#000000')
  const width = Math.max(MIN_TEXT_BOX_WIDTH, Math.round(params?.width ?? 360))
  const fontSize = getNumberInBetween(
    MIN_TEXT_FONT_SIZE,
    MAX_TEXT_FONT_SIZE,
    Math.round(params?.fontSize ?? 48),
    0
  )
  return {
    text: params?.text ?? '',
    fontFamily: DEFAULT_TEXT_FONT_FAMILY,
    fontWeight: 400,
    italic: false,
    fontSize,
    lineHeight: 1.25,
    letterSpacing: 0,
    align: 'left',
    vAlign: 'top',
    color,
    opacity: 1,
    underline: false,
    strike: false,
    strokeWidth: 0,
    strokeColor: '#ffffff',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowColor: '#000000',
    x: Math.round(params?.x ?? 100),
    y: Math.round(params?.y ?? 100),
    width,
    widthLocked: false,
    rotation: 0,
    flipX: false,
    flipY: false,
  }
}

export const cloneTextSpec = (spec: TextSpec | null | undefined): TextSpec | undefined => {
  if (!spec || typeof spec !== 'object') return undefined
  return {
    text: typeof spec.text === 'string' ? spec.text : '',
    fontFamily:
      typeof spec.fontFamily === 'string' && spec.fontFamily.trim()
        ? spec.fontFamily
        : DEFAULT_TEXT_FONT_FAMILY,
    fontWeight: getNumberInBetween(100, 900, Number(spec.fontWeight) || 400, 0),
    italic: Boolean(spec.italic),
    fontSize: getNumberInBetween(
      MIN_TEXT_FONT_SIZE,
      MAX_TEXT_FONT_SIZE,
      Number(spec.fontSize) || 48,
      2
    ),
    lineHeight: getNumberInBetween(0.8, 3, Number(spec.lineHeight) || 1.25, 3),
    letterSpacing: getNumberInBetween(-20, 80, Number(spec.letterSpacing) || 0, 2),
    align: isTextAlign(spec.align) ? spec.align : 'left',
    vAlign: isTextVAlign(spec.vAlign) ? spec.vAlign : 'top',
    color: normalizeTextHex(spec.color, '#000000'),
    opacity: getNumberInBetween(0.05, 1, Number(spec.opacity ?? 1), 3),
    underline: Boolean(spec.underline),
    strike: Boolean(spec.strike),
    strokeWidth: getNumberInBetween(0, 40, Number(spec.strokeWidth) || 0, 2),
    strokeColor: normalizeTextHex(spec.strokeColor, '#ffffff'),
    shadowBlur: getNumberInBetween(0, 64, Number(spec.shadowBlur) || 0, 2),
    shadowOffsetX: getNumberInBetween(-64, 64, Number(spec.shadowOffsetX) || 0, 2),
    shadowOffsetY: getNumberInBetween(-64, 64, Number(spec.shadowOffsetY) || 0, 2),
    shadowColor: normalizeTextHex(spec.shadowColor, '#000000'),
    x: Number.isFinite(spec.x) ? Number(spec.x) : 100,
    y: Number.isFinite(spec.y) ? Number(spec.y) : 100,
    width: Math.max(MIN_TEXT_BOX_WIDTH, Number(spec.width) || 360),
    widthLocked: Boolean(spec.widthLocked),
    rotation: Number.isFinite(spec.rotation) ? Number(spec.rotation) : 0,
    flipX: Boolean(spec.flipX),
    flipY: Boolean(spec.flipY),
  }
}

export const deriveLayerNameFromText = (text: string, fallback = 'Text'): string => {
  const firstLine = (text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  if (!firstLine) return fallback
  return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine
}

export const buildCanvasFontString = (
  spec: Pick<TextSpec, 'italic' | 'fontWeight' | 'fontSize' | 'fontFamily'>
): string => {
  const style = spec.italic ? 'italic ' : ''
  const weight = Math.round(spec.fontWeight || 400)
  const size = Math.max(MIN_TEXT_FONT_SIZE, spec.fontSize || 48)
  const family = (spec.fontFamily || DEFAULT_TEXT_FONT_FAMILY).replace(/"/g, '')
  return `${style}${weight} ${size}px "${family}", "Poppins", sans-serif`
}

export const computeTextBoxBounds = (spec: TextSpec, contentHeight: number): TextBoxBounds => {
  const height = Math.max(spec.fontSize * spec.lineHeight, contentHeight)
  const width = Math.max(MIN_TEXT_BOX_WIDTH, spec.width)
  return {
    x: spec.x,
    y: spec.y,
    width,
    height,
    cx: spec.x + width / 2,
    cy: spec.y + height / 2,
    rotation: spec.rotation || 0,
  }
}

export const applyAffineResizeToTextSpec = (
  spec: TextSpec,
  start: { x: number; y: number; w: number; h: number },
  end: { x: number; y: number; w: number; h: number; r: number }
): TextSpec => {
  const next = cloneTextSpec(spec)
  if (!next) return spec
  const sx = start.w > 1 ? end.w / start.w : 1
  const sy = start.h > 1 ? end.h / start.h : 1
  const scale = (sx + sy) / 2
  next.width = Math.max(MIN_TEXT_BOX_WIDTH, next.width * sx)
  next.fontSize = getNumberInBetween(
    MIN_TEXT_FONT_SIZE,
    MAX_TEXT_FONT_SIZE,
    next.fontSize * scale,
    2
  )
  next.strokeWidth = getNumberInBetween(0, 40, next.strokeWidth * scale, 2)
  next.letterSpacing = getNumberInBetween(-20, 80, next.letterSpacing * scale, 2)
  next.shadowBlur = getNumberInBetween(0, 64, next.shadowBlur * scale, 2)
  next.shadowOffsetX = getNumberInBetween(-64, 64, next.shadowOffsetX * sx, 2)
  next.shadowOffsetY = getNumberInBetween(-64, 64, next.shadowOffsetY * sy, 2)
  next.rotation = (next.rotation || 0) + ((end.r || 0) * Math.PI) / 180

  const before = computeTextBoxBounds(
    spec,
    Math.max(spec.fontSize, spec.fontSize * spec.lineHeight)
  )
  const dx = before.cx - start.x
  const dy = before.cy - start.y
  const rad = ((end.r || 0) * Math.PI) / 180
  const rotDx = dx * sx * Math.cos(rad) - dy * sy * Math.sin(rad)
  const rotDy = dx * sx * Math.sin(rad) + dy * sy * Math.cos(rad)
  const targetCx = end.x + rotDx
  const targetCy = end.y + rotDy
  const after = computeTextBoxBounds(next, Math.max(next.fontSize, next.fontSize * next.lineHeight))
  next.x += targetCx - after.cx
  next.y += targetCy - after.cy
  return cloneTextSpec(next) || next
}

export const resolveRestoredTextSpec = (
  step: { textSpec?: TextSpec | null } | undefined
): TextSpec | undefined => {
  if (!step || step.textSpec == null) return undefined
  return cloneTextSpec(step.textSpec)
}

export const hitTestTextBox = (
  px: number,
  py: number,
  bounds: TextBoxBounds,
  marginPx = 8
): boolean => {
  const dx = px - bounds.cx
  const dy = py - bounds.cy
  const cos = Math.cos(-(bounds.rotation || 0))
  const sin = Math.sin(-(bounds.rotation || 0))
  const lx = dx * cos - dy * sin + bounds.cx
  const ly = dx * sin + dy * cos + bounds.cy
  return (
    lx >= bounds.x - marginPx &&
    lx <= bounds.x + bounds.width + marginPx &&
    ly >= bounds.y - marginPx &&
    ly <= bounds.y + bounds.height + marginPx
  )
}
