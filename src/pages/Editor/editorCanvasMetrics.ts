import Params from 'main/Params'
import { spacing } from 'main/Theme'
import { round } from 'utils/mathUtils'

export interface CanvasOffset {
  left: number
  top: number
  right: number
  bottom: number
}

export const computeCanvasOffset = (): CanvasOffset => {
  const safeRight =
    parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--safe-area-right'),
      10
    ) || 0
  if (Params.isPhone) {
    const landscapePadding = Params.width > Params.height ? spacing.PHONE_LANDSCAPE_PADDING : 0
    return {
      left: spacing.EDITOR_PAGE_MARGIN + landscapePadding,
      top: spacing.EDITOR_PAGE_MARGIN + spacing.HEADER_HEIGHT,
      right: spacing.EDITOR_PAGE_MARGIN + landscapePadding + safeRight,
      bottom: spacing.APP_MARGIN_BOTTOM,
    }
  }
  return {
    left: spacing.EDITOR_PAGE_MARGIN + spacing.EDITOR_TOOLS_WIDTH,
    top: spacing.EDITOR_PAGE_MARGIN + spacing.HEADER_HEIGHT,
    right: spacing.EDITOR_PAGE_MARGIN + spacing.EDITOR_TOOLS_WIDTH + safeRight,
    bottom: spacing.EDITOR_PAGE_MARGIN + spacing.COLORPICKER_HEIGHT + spacing.APP_MARGIN_BOTTOM,
  }
}

export const measureCoworkingCanvasPxSizes = (): [number, number] => {
  const offset = computeCanvasOffset()
  const width = round((Params.width - offset.left - offset.right) * Params.pxScale, 0)
  const height = round((Params.height - offset.top - offset.bottom) * Params.pxScale, 0)
  return [width + spacing.EDITOR_TOOLS_WIDTH, height]
}
