import Params from 'main/Params'
import { colorStringToRgb } from 'utils/colorsUtils'
import { getNumberInBetween, round } from 'utils/mathUtils'

export type GradientKind = 'linear' | 'radial' | 'angular'
export const GRADIENT_KINDS: readonly GradientKind[] = ['linear', 'radial', 'angular']

export type GradientHandleTarget = 'start' | 'end'

export interface GradientFillSpec {
  kind: GradientKind
  x0: number
  y0: number
  x1: number
  y1: number
  color1: string
  color2: string
  opacity: number
}

const MIN_GRADIENT_DRAG_DISTANCE_PX = 6

export const isGradientKind = (value: unknown): value is GradientKind =>
  value === 'linear' || value === 'radial' || value === 'angular'

export const normalizeGradientHex = (
  hex: string | false | undefined,
  fallback = '#000000'
): string => {
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

export const resolveDefaultGradientColors = (
  paletteHex?: string | false
): { color1: string; color2: string } => {
  const color1 = normalizeGradientHex(paletteHex, '#000000')
  const color2 = color1.toLowerCase() === '#ffffff' ? '#000000' : '#ffffff'
  return { color1, color2 }
}

export const selectExclusiveGradientKind = (current: GradientKind, next: unknown): GradientKind =>
  isGradientKind(next) ? next : current

export const syncGradientKindButtons = (
  buttons: Partial<Record<GradientKind, HTMLElement | null>> | undefined,
  activeKind: GradientKind
) => {
  if (!buttons) return
  for (const kind of GRADIENT_KINDS) {
    buttons[kind]?.classList.toggle('selected', kind === activeKind)
  }
}

export const syncGradientSwatchDom = (swatchEl: HTMLElement | null, hex: string) => {
  if (!swatchEl) return
  const normalized = normalizeGradientHex(hex)
  swatchEl.style.backgroundColor = normalized
  swatchEl.classList.remove(
    'editor-colorpicker__color-selected',
    'editor-colorpicker__color-selected-light'
  )
}

export const isGradientDragValid = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minDistance = MIN_GRADIENT_DRAG_DISTANCE_PX
): boolean => Math.hypot(x1 - x0, y1 - y0) >= minDistance

export const getGradientHandleHitRadiusPx = (canvasScale = 1): number =>
  (24 * Params.pxScale) / Math.max(0.25, canvasScale || 1)

export const hitTestGradientEndpoint = (
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  hitRadiusPx = getGradientHandleHitRadiusPx(1)
): GradientHandleTarget | null => {
  const distEnd = Math.hypot(px - x1, py - y1)
  const distStart = Math.hypot(px - x0, py - y0)
  if (distEnd > hitRadiusPx && distStart > hitRadiusPx) return null
  return distEnd <= distStart ? 'end' : 'start'
}

export const computeGradientFactorAtPoint = (
  kind: GradientKind,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  px: number,
  py: number
): number => {
  const dx = x1 - x0
  const dy = y1 - y0
  const lenSq = dx * dx + dy * dy
  if (lenSq <= 1e-9) return 0

  if (kind === 'linear') {
    const raw = ((px - x0) * dx + (py - y0) * dy) / lenSq
    if (raw <= 0) return 0
    if (raw >= 1) return 1
    return raw
  }

  if (kind === 'radial') {
    const radius = Math.sqrt(lenSq)
    const dist = Math.hypot(px - x0, py - y0)
    if (dist <= 0) return 0
    if (dist >= radius) return 1
    return dist / radius
  }

  // angular
  const vx = px - x0
  const vy = py - y0
  if (vx * vx + vy * vy <= 1e-9) return 0
  const baseAngle = Math.atan2(dy, dx)
  const ptAngle = Math.atan2(vy, vx)
  const diff = Math.atan2(Math.sin(ptAngle - baseAngle), Math.cos(ptAngle - baseAngle))
  return getNumberInBetween(0, 1, Math.abs(diff) / Math.PI, 6)
}

export const sampleGradientColorAtPoint = (
  spec: Pick<GradientFillSpec, 'kind' | 'x0' | 'y0' | 'x1' | 'y1' | 'color1' | 'color2'>,
  px: number,
  py: number
): [number, number, number] => {
  const t = computeGradientFactorAtPoint(spec.kind, spec.x0, spec.y0, spec.x1, spec.y1, px, py)
  const c1 = colorStringToRgb(normalizeGradientHex(spec.color1, '#000000'))
  const c2 = colorStringToRgb(normalizeGradientHex(spec.color2, '#ffffff'))
  return [
    round(c1.r + (c2.r - c1.r) * t, 0),
    round(c1.g + (c2.g - c1.g) * t, 0),
    round(c1.b + (c2.b - c1.b) * t, 0),
  ]
}

export interface PaintGradientFillOptions {
  snapshotCanvas?: HTMLCanvasElement | null
  clipToSelection?: (ctx: CanvasRenderingContext2D) => void
}

type ConicCapableContext = CanvasRenderingContext2D & {
  createConicGradient?: (startAngle: number, x: number, y: number) => CanvasGradient
}

const buildCanvasGradient = (
  ctx: ConicCapableContext,
  spec: GradientFillSpec
): CanvasGradient | null => {
  const c1 = normalizeGradientHex(spec.color1, '#000000')
  const c2 = normalizeGradientHex(spec.color2, '#ffffff')
  if (spec.kind === 'linear') {
    if (typeof ctx.createLinearGradient !== 'function') return null
    const grad = ctx.createLinearGradient(spec.x0, spec.y0, spec.x1, spec.y1)
    grad.addColorStop(0, c1)
    grad.addColorStop(1, c2)
    return grad
  }
  if (spec.kind === 'radial') {
    if (typeof ctx.createRadialGradient !== 'function') return null
    const r = Math.max(0.5, Math.hypot(spec.x1 - spec.x0, spec.y1 - spec.y0))
    const grad = ctx.createRadialGradient(spec.x0, spec.y0, 0, spec.x0, spec.y0, r)
    grad.addColorStop(0, c1)
    grad.addColorStop(1, c2)
    return grad
  }
  if (typeof ctx.createConicGradient === 'function') {
    const startAngle = Math.atan2(spec.y1 - spec.y0, spec.x1 - spec.x0)
    const grad = ctx.createConicGradient(startAngle, spec.x0, spec.y0)
    grad.addColorStop(0, c1)
    grad.addColorStop(0.5, c2)
    grad.addColorStop(1, c1)
    return grad
  }
  return null
}

export const paintGradientFillOnContext = (
  ctx: CanvasRenderingContext2D | null | undefined,
  spec: GradientFillSpec,
  options?: PaintGradientFillOptions
) => {
  if (!ctx?.canvas) return
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  if (w <= 0 || h <= 0) return

  const prevAlpha = ctx.globalAlpha
  const prevGco = ctx.globalCompositeOperation

  if (options?.snapshotCanvas) {
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(options.snapshotCanvas, 0, 0)
  }

  const alpha = getNumberInBetween(0, 1, spec.opacity, 4)
  if (alpha <= 0) {
    ctx.globalAlpha = prevAlpha
    ctx.globalCompositeOperation = prevGco
    return
  }

  const grad = buildCanvasGradient(ctx as ConicCapableContext, spec)
  if (grad) {
    const clip = options?.clipToSelection
    if (clip) ctx.save()
    clip?.(ctx)
    ctx.globalAlpha = alpha
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    if (clip) ctx.restore()
  }

  ctx.globalAlpha = prevAlpha
  ctx.globalCompositeOperation = prevGco
}

const strokeDualTonePath = (
  ctx: CanvasRenderingContext2D,
  unit: number,
  drawPath: () => void,
  darkAlpha = 0.72,
  lightAlpha = 0.96,
  dashed = false
) => {
  ctx.save()
  if (dashed && typeof ctx.setLineDash === 'function') {
    ctx.setLineDash([unit * 4.5, unit * 3.5])
  } else if (typeof ctx.setLineDash === 'function') {
    ctx.setLineDash([])
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  drawPath()
  ctx.lineWidth = unit * 2.8
  ctx.strokeStyle = `rgba(15, 23, 42, ${darkAlpha})`
  ctx.stroke()

  ctx.beginPath()
  drawPath()
  ctx.lineWidth = unit * 1.4
  ctx.strokeStyle = `rgba(255, 255, 255, ${lightAlpha})`
  ctx.stroke()
  ctx.restore()
}

const drawEndpointDot = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hex: string,
  unit: number
) => {
  if (typeof ctx.arc !== 'function') return
  const r = unit * 7.5
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = normalizeGradientHex(hex)
  ctx.fill()
  ctx.lineWidth = unit * 2.4
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.82)'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x, y, Math.max(unit, r - unit * 1.3), 0, Math.PI * 2)
  ctx.lineWidth = unit * 1.3
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)'
  ctx.stroke()
  ctx.restore()
}

export const clearGradientGuideOverlay = (overlayCanvas: HTMLCanvasElement | null) => {
  if (!overlayCanvas) return
  const ctx = overlayCanvas.getContext('2d')
  ctx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
  overlayCanvas.classList.add('displayNone')
}

export const renderGradientGuideOverlay = (
  overlayCanvas: HTMLCanvasElement | null,
  spec: GradientFillSpec,
  canvasScale: number,
  clipMaskCanvas?: HTMLCanvasElement | null
) => {
  if (!overlayCanvas) return
  const ctx = overlayCanvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
  overlayCanvas.classList.remove('displayNone')

  const unit = Math.max(0.5, Params.pxScale / Math.max(0.25, canvasScale || 1))
  const { x0, y0, x1, y1, kind, color1, color2 } = spec
  const radius = Math.hypot(x1 - x0, y1 - y0)

  if (kind === 'linear') {
    strokeDualTonePath(ctx, unit, () => {
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
    })
  } else if (kind === 'radial') {
    if (radius > 0.5 && typeof ctx.arc === 'function') {
      strokeDualTonePath(
        ctx,
        unit,
        () => {
          ctx.arc(x0, y0, radius, 0, Math.PI * 2)
        },
        0.55,
        0.88
      )
    }
    strokeDualTonePath(ctx, unit, () => {
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
    })
  } else {
    // angular: dragged ray + faint opposite ray
    const oppX = x0 - (x1 - x0)
    const oppY = y0 - (y1 - y0)
    strokeDualTonePath(
      ctx,
      unit,
      () => {
        ctx.moveTo(x0, y0)
        ctx.lineTo(oppX, oppY)
      },
      0.32,
      0.52,
      true
    )
    strokeDualTonePath(ctx, unit, () => {
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
    })
  }

  if (clipMaskCanvas && clipMaskCanvas.width > 0 && clipMaskCanvas.height > 0) {
    const prevGco = ctx.globalCompositeOperation
    const prevAlpha = ctx.globalAlpha
    ctx.globalCompositeOperation = 'destination-in'
    ctx.globalAlpha = 1
    ctx.drawImage(clipMaskCanvas, 0, 0)
    ctx.globalCompositeOperation = prevGco
    ctx.globalAlpha = prevAlpha
  }

  drawEndpointDot(ctx, x0, y0, color1, unit)
  drawEndpointDot(ctx, x1, y1, color2, unit)
}
