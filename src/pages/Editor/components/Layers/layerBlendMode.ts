export const LAYER_BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'add'] as const

export type LayerBlendMode = (typeof LAYER_BLEND_MODES)[number]

export const LAYER_BLEND_MODE_LABELS: Record<LayerBlendMode, string> = {
  normal: 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  add: 'Add',
}

const LAYER_BLEND_MODE_BADGE_LETTER: Record<LayerBlendMode, string | false> = {
  normal: false,
  multiply: 'M',
  screen: 'S',
  overlay: 'O',
  add: 'A',
}

export const blendModeBadgeLetter = (mode: LayerBlendMode | undefined): string | false =>
  LAYER_BLEND_MODE_BADGE_LETTER[normalizeBlendMode(mode)]

export const normalizeBlendMode = (value: unknown): LayerBlendMode => {
  if (typeof value === 'string' && (LAYER_BLEND_MODES as readonly string[]).includes(value)) {
    return value as LayerBlendMode
  }
  return 'normal'
}

export const nextBlendMode = (mode: LayerBlendMode): LayerBlendMode => {
  const index = LAYER_BLEND_MODES.indexOf(mode)
  const nextIndex = index < 0 ? 0 : (index + 1) % LAYER_BLEND_MODES.length
  return LAYER_BLEND_MODES[nextIndex]
}

export const blendModeToCss = (mode: LayerBlendMode): string => {
  if (mode === 'add') return 'plus-lighter'
  if (mode === 'normal') return 'normal'
  return mode
}

export const blendModeToCanvasGco = (mode: LayerBlendMode): GlobalCompositeOperation => {
  switch (mode) {
    case 'multiply':
      return 'multiply'
    case 'screen':
      return 'screen'
    case 'overlay':
      return 'overlay'
    case 'add':
      return 'lighter'
    default:
      return 'source-over'
  }
}

export const applyBlendModeToDomCanvas = (
  canvas: HTMLElement,
  mode: LayerBlendMode | undefined
) => {
  canvas.style.mixBlendMode = blendModeToCss(normalizeBlendMode(mode))
}

/** Canvas flatten: draw one layer onto an accumulating bitmap (export / previews). */
export const compositeLayerOntoContext = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  opacity: number,
  blendMode: LayerBlendMode | undefined
) => {
  ctx.globalAlpha = opacity
  ctx.globalCompositeOperation = blendModeToCanvasGco(normalizeBlendMode(blendMode))
  ctx.drawImage(source, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

/** mergeImages: first painted slice is always source-over; upper slices use layer blend. */
export const mergeStackCompositeOperation = (
  isFirstDrawWithContent: boolean,
  blendMode: LayerBlendMode | undefined
): GlobalCompositeOperation => {
  if (isFirstDrawWithContent) return 'source-over'
  return blendModeToCanvasGco(normalizeBlendMode(blendMode))
}

/** GCO sequence for flattening visible layers bottom → top (matches exportWholeCanvasData). */
export const exportStackCompositeOperations = (
  layers: Array<{ active: boolean; blendMode?: LayerBlendMode }>
): GlobalCompositeOperation[] =>
  layers
    .filter((layer) => layer.active)
    .map((layer) => blendModeToCanvasGco(normalizeBlendMode(layer.blendMode)))
