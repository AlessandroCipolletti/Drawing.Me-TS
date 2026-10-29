import {
  buildCanvasFontString,
  computeTextBoxBounds,
  MIN_TEXT_BOX_WIDTH,
  TEXT_EDIT_PLACEHOLDER,
  type TextBoxBounds,
  type TextSpec,
} from './textSpec'

interface TextLayoutLine {
  text: string
  width: number
  yOffset: number
}

export interface TextLayoutResult {
  lines: TextLayoutLine[]
  lineStepPx: number
  totalTextHeight: number
  maxLineWidth: number
  boxBounds: TextBoxBounds
}

export type TextMeasureFn = (text: string) => number

const createCanvasTextMeasurer = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined,
  spec: Pick<TextSpec, 'italic' | 'fontWeight' | 'fontSize' | 'fontFamily' | 'letterSpacing'>
): TextMeasureFn => {
  const fontStr = buildCanvasFontString(spec)
  const spacing = Number(spec.letterSpacing) || 0
  if (ctx) {
    ctx.font = fontStr
  }
  return (text: string): number => {
    if (!text) return 0
    const glyphs = Array.from(text)
    const extraSpacing = glyphs.length > 1 ? (glyphs.length - 1) * spacing : 0
    if (ctx && typeof ctx.measureText === 'function') {
      ctx.font = fontStr
      const measured = ctx.measureText(text)?.width
      if (Number.isFinite(measured) && measured > 0) {
        return measured + extraSpacing
      }
    }
    return glyphs.length * spec.fontSize * 0.56 + extraSpacing
  }
}

const breakLongToken = (token: string, maxWidth: number, measure: TextMeasureFn): string[] => {
  const chars = Array.from(token)
  if (chars.length <= 1) return [token]
  const chunks: string[] = []
  let current = ''
  for (const ch of chars) {
    const candidate = current + ch
    if (current && measure(candidate) > maxWidth) {
      chunks.push(current)
      current = ch
    } else {
      current = candidate
    }
  }
  if (current) chunks.push(current)
  return chunks
}

const wrapParagraph = (paragraph: string, maxWidth: number, measure: TextMeasureFn): string[] => {
  if (!paragraph) return ['']
  const tokens = paragraph.split(/(\s+)/).filter((t) => t.length > 0)
  const lines: string[] = []
  let current = ''

  for (const token of tokens) {
    const isSpace = /^\s+$/.test(token)
    if (!current && isSpace) continue
    const candidate = current + token
    if (!current || measure(candidate) <= maxWidth) {
      if (!current && measure(token) > maxWidth && !isSpace) {
        const subChunks = breakLongToken(token, maxWidth, measure)
        for (let i = 0; i < subChunks.length - 1; i++) {
          lines.push(subChunks[i])
        }
        current = subChunks[subChunks.length - 1] || ''
      } else {
        current = candidate
      }
      continue
    }

    lines.push(current.trimEnd())
    if (isSpace) {
      current = ''
    } else if (measure(token) > maxWidth) {
      const subChunks = breakLongToken(token, maxWidth, measure)
      for (let i = 0; i < subChunks.length - 1; i++) {
        lines.push(subChunks[i])
      }
      current = subChunks[subChunks.length - 1] || ''
    } else {
      current = token
    }
  }

  if (current || lines.length === 0) {
    lines.push(current.trimEnd())
  }
  return lines
}

export const fitAutoTextBoxWidth = (
  spec: TextSpec,
  canvasWidth: number,
  ctx?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  customMeasure?: TextMeasureFn
) => {
  if (spec.widthLocked || !(canvasWidth > 0)) return
  const measure = customMeasure || createCanvasTextMeasurer(ctx, spec)
  const room = Math.max(MIN_TEXT_BOX_WIDTH, canvasWidth - Math.max(0, spec.x))
  const floor = measure(TEXT_EDIT_PLACEHOLDER)
  let content = 0
  if (spec.text) {
    for (const line of spec.text.split(/\r?\n/)) {
      content = Math.max(content, measure(line))
    }
  }
  spec.width = Math.min(room, Math.max(floor, content, MIN_TEXT_BOX_WIDTH))
}

export const layoutTextSpec = (
  spec: TextSpec,
  ctx?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  customMeasure?: TextMeasureFn
): TextLayoutResult => {
  const maxWidth = Math.max(MIN_TEXT_BOX_WIDTH, spec.width)
  const measure = customMeasure || createCanvasTextMeasurer(ctx, spec)
  const rawParagraphs = (spec.text || '').split(/\r?\n/)
  const wrappedStrings: string[] = []

  for (const para of rawParagraphs) {
    const paraLines = wrapParagraph(para, maxWidth, measure)
    wrappedStrings.push(...paraLines)
  }
  if (wrappedStrings.length === 0) {
    wrappedStrings.push('')
  }

  const lineStepPx = Math.max(8, spec.fontSize * spec.lineHeight)
  const totalTextHeight = wrappedStrings.length * lineStepPx
  let maxLineWidth = 0

  const lines: TextLayoutLine[] = wrappedStrings.map((lineText, idx) => {
    const w = measure(lineText)
    if (w > maxLineWidth) maxLineWidth = w
    return {
      text: lineText,
      width: w,
      yOffset: idx * lineStepPx,
    }
  })

  const boxBounds = computeTextBoxBounds(spec, totalTextHeight)

  return {
    lines,
    lineStepPx,
    totalTextHeight,
    maxLineWidth,
    boxBounds,
  }
}
