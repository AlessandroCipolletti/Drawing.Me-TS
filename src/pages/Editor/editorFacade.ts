import { ExtendedCanvasContext } from 'utils/canvasUtils'
import { PaletteColor } from './components/ColorPicker/paletteColor'
import { CurrentToolProps } from './editorTypes'

export interface EditorFacade {
  saveCopy: (e?: Event) => Promise<void> | void
  saveAndGoToFolder: () => Promise<void> | void
  toggleFullscreen: (e?: Event) => void
  changePaper: (paper: string) => void
  clear: () => void
  setTool: (toolProps: Partial<CurrentToolProps>) => void
  setToolColor: (color: string | false, randomColor: boolean) => void
  saveDrawingsPalette: (colors: PaletteColor[]) => Promise<void> | void
  saveLayersSidebarExpanded: (expanded: boolean) => void
  hidePipetteCursor: () => Promise<void> | void
  setDrawingModified: () => void
  setDesktopCanvasPanMode: (active: boolean) => void
  hideDragBox: () => void
  showDragBox: (x: number, y: number, w: number, h: number, useMagnetism: boolean) => void
  flushPendingResizeFrame: () => void
  appendLayer: (canvas: HTMLCanvasElement) => void
  updateEditorLayer: (
    layerZIndex: number,
    opacity: number,
    globalCompositeOperation: GlobalCompositeOperation,
    active: boolean
  ) => void
  setLayerContext: (context: ExtendedCanvasContext) => void
}

let currentFacade: EditorFacade | null = null

export const registerEditorFacade = (facade: EditorFacade) => {
  currentFacade = facade
}

export const editorFacade: EditorFacade = {
  saveCopy: (e) => currentFacade?.saveCopy(e),
  saveAndGoToFolder: () => currentFacade?.saveAndGoToFolder(),
  toggleFullscreen: (e) => currentFacade?.toggleFullscreen(e),
  changePaper: (paper) => currentFacade?.changePaper(paper),
  clear: () => currentFacade?.clear(),
  setTool: (toolProps) => currentFacade?.setTool(toolProps),
  setToolColor: (color, randomColor) => currentFacade?.setToolColor(color, randomColor),
  saveDrawingsPalette: (colors) => currentFacade?.saveDrawingsPalette(colors),
  saveLayersSidebarExpanded: (expanded) => currentFacade?.saveLayersSidebarExpanded(expanded),
  hidePipetteCursor: () => currentFacade?.hidePipetteCursor(),
  setDrawingModified: () => currentFacade?.setDrawingModified(),
  setDesktopCanvasPanMode: (active) => currentFacade?.setDesktopCanvasPanMode(active),
  hideDragBox: () => currentFacade?.hideDragBox(),
  showDragBox: (x, y, w, h, useMagnetism) => currentFacade?.showDragBox(x, y, w, h, useMagnetism),
  flushPendingResizeFrame: () => currentFacade?.flushPendingResizeFrame(),
  appendLayer: (canvas) => currentFacade?.appendLayer(canvas),
  updateEditorLayer: (layerZIndex, opacity, globalCompositeOperation, active) =>
    currentFacade?.updateEditorLayer(layerZIndex, opacity, globalCompositeOperation, active),
  setLayerContext: (ctx) => currentFacade?.setLayerContext(ctx),
}
