import type { ToolCustomPropsMap } from './config'
import type { PaletteColor } from './components/ColorPicker/paletteColor'

export interface EditorCalls {
  toggleButton: (tool: string, enabled: boolean) => void
  clickButton: (tool: string) => void
  selectLastUsedTool: (showToolChange?: boolean) => void
  setCurrentToolCustomProps: (customProps: ToolCustomPropsMap) => void
  showRuler: () => void
  hideRuler: () => void
  closeResizeModeIfNeeded: () => void
  updateCurrentTool: (isUsingEraser: boolean) => void
  undoLayers: () => Promise<void>
  redoLayers: () => Promise<void>
  deselectPipette: (
    selectLastUsedTool?: boolean,
    showToolChange?: boolean,
    selectLastUsedColor?: boolean
  ) => void
  getCurrentColorsPalette: () => PaletteColor[]
  getCurrentSelectedColorId: () => number
  addOptionButtonsGroup: (buttons?: HTMLElement[], side?: 'left' | 'center' | 'right') => void
  beginColorDropFromSwatch: (fillHex: string, clientX: number, clientY: number) => void
  updateColorDropPointer: (clientX: number, clientY: number) => void
  endColorDropPointer: (clientX: number, clientY: number) => void
  cancelColorDrop: () => void
  isColorDropActive: () => boolean
  cancelColorPickerLongPress: () => void
}

export const editorCalls = {} as EditorCalls

export const registerEditorCalls = (part: Partial<EditorCalls>) => {
  Object.assign(editorCalls, part)
}
