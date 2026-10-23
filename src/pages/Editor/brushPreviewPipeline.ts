import { drawMultipleSteps, ExtendedCanvasContext, StrokeSample } from 'utils/canvasUtils'
import { getStepsDataFromTouchEvents } from './editorUtils'
import { CurrentToolProps, PointerTouchEvent } from './editorTypes'
import { getToolPreviewTouchEvents, PreviewTouchSample } from './components/Toolbar/toolbarUtils'

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
