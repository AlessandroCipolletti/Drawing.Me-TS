import { drawMultipleSteps, ExtendedCanvasContext, StrokeSample } from 'utils/canvasUtils'
import { getStepsDataFromTouchEvents } from './editorUtils'
import { CurrentToolProps, PointerTouchEvent } from './editorTypes'
import { getToolPreviewTouchEvents, PreviewTouchSample } from './components/Toolbar/toolbarUtils'
import { createEffectBrushStrokeSession, effectBrushStrokeStep } from './effectBrushKernel'
import { isEffectBrushToolName, type EffectBrushKind } from './effectBrushFilters'
import previewPhotoUrl from 'static/img/preview-macaw.jpg'

const previewPhotoImage: HTMLImageElement | null = typeof Image !== 'undefined' ? new Image() : null
if (previewPhotoImage) previewPhotoImage.src = previewPhotoUrl

/**
 * Preview backdrop: a blue-and-gold macaw close-up (public domain, DPLA).
 * Chosen because it shows both effects at once — fine feather barbs, eye and
 * facial stripes for sharpen/blur, and rich blue/yellow/green plumage plus a
 * soft green background for saturate/desaturate. Cropped square on the head.
 * Falls back to a synthetic scene until the image has loaded.
 */
const drawEffectTestScene = (ctx: ExtendedCanvasContext, width: number, height: number) => {
  const c = ctx as unknown as CanvasRenderingContext2D
  if (previewPhotoImage && previewPhotoImage.complete && previewPhotoImage.naturalWidth > 0) {
    const s = Math.min(previewPhotoImage.naturalWidth, previewPhotoImage.naturalHeight)
    const sx = (previewPhotoImage.naturalWidth - s) * 0.22
    const sy = (previewPhotoImage.naturalHeight - s) * 0.5
    c.drawImage(previewPhotoImage, sx, sy, s, s, 0, 0, width, height)
    return
  }
  const sky = c.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#7ec3f2')
  sky.addColorStop(0.55, '#f7e3a1')
  sky.addColorStop(1, '#e88ca0')
  c.fillStyle = sky
  c.fillRect(0, 0, width, height)
  // Mid-saturation colours on purpose: both saturate and desaturate must
  // stay visible in the preview (fully saturated colours cannot saturate).
  const blobs: Array<[number, number, number, string]> = [
    [0.26, 0.34, 0.21, '#c96a5e'],
    [0.58, 0.28, 0.16, '#d9a05a'],
    [0.76, 0.55, 0.2, '#6fae7d'],
    [0.4, 0.66, 0.17, '#6d7fc4'],
    [0.66, 0.8, 0.13, '#a87fc0'],
  ]
  for (const [fx, fy, fr, color] of blobs) {
    c.fillStyle = color
    c.beginPath()
    c.arc(width * fx, height * fy, Math.min(width, height) * fr, 0, Math.PI * 2)
    c.fill()
  }
  // Fine checker detail in one corner: blur/sharpen read clearly on it.
  const cell = Math.max(3, Math.round(Math.min(width, height) / 22))
  const cw = cell * 6
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      c.fillStyle = (x + y) % 2 === 0 ? '#111111' : '#f5f5f5'
      c.fillRect(width - cw + x * cell, height - cw + y * cell, cell, cell)
    }
  }
  c.fillStyle = 'rgba(70,70,70,0.85)'
  c.fillRect(0, height * 0.48, width, Math.max(2, height * 0.035))
}

export const renderEffectBrushPreview = (
  ctx: ExtendedCanvasContext,
  toolProps: CurrentToolProps,
  touchSamples: PreviewTouchSample[] | PointerTouchEvent[],
  signedIntensity: number
): void => {
  if (!isEffectBrushToolName(toolProps.name)) return
  const canvas = ctx.canvas
  if (!canvas?.width || !canvas?.height) return
  drawEffectTestScene(ctx, canvas.width, canvas.height)
  const steps = getStepsDataFromTouchEvents(
    touchSamples as PointerTouchEvent[],
    toolProps as CurrentToolProps
  )
  const session = createEffectBrushStrokeSession()
  steps.forEach((step, index) => {
    const phase = index === 0 ? 'start' : index === steps.length - 1 ? 'end' : 'move'
    effectBrushStrokeStep(
      ctx,
      session,
      step,
      phase,
      toolProps.name as EffectBrushKind,
      signedIntensity,
      Infinity
    )
  })
}

export { getToolPreviewTouchEvents }
export type { PreviewTouchSample }

export const renderBrushPreview = (
  ctx: ExtendedCanvasContext,
  toolProps: CurrentToolProps,
  touchSamples: PreviewTouchSample[] | PointerTouchEvent[]
): StrokeSample[] => {
  const effectiveProps: CurrentToolProps = {
    ...toolProps,
    globalCompositeOperation:
      toolProps.globalCompositeOperation === 'destination-out' ? 'destination-out' : 'source-over',
  }
  const previewSteps = getStepsDataFromTouchEvents(
    touchSamples as PointerTouchEvent[],
    effectiveProps
  )
  drawMultipleSteps(ctx, previewSteps, effectiveProps)
  return previewSteps
}
