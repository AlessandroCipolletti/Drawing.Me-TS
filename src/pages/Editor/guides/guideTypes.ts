export type SymmetrySectorCount = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12'

export type SymmetryMode = 'off' | SymmetrySectorCount

/** Restored when the user turns mirrors on and has no prior sector choice */
export const DEFAULT_SYMMETRY_SECTOR: SymmetrySectorCount = '6'

export const SYMMETRY_SECTOR_COUNTS: readonly SymmetrySectorCount[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
]

export interface SceneGuidesState {
  symmetry: SymmetryMode
  /** Restored when re-enabling mirrors from the toolbar icon */
  lastSymmetryMode: SymmetryMode
  /** Rotates the whole guide pattern around the origin (radians) */
  rotationRad: number
  /** Symmetry center point in layer/canvas pixel space */
  originX: number
  originY: number
  /** When false, origin stays fixed and strokes pass through the center */
  showOriginHandle: boolean
}

export type SceneGuidesSnapshot = SceneGuidesState

export const normalizeSymmetryMode = (value: unknown): SymmetryMode => {
  if (value === 'vertical' || value === 'horizontal') return '2'
  if (value === 'quadrant' || value === 'radial') return '4'
  const str = String(value)
  if ((SYMMETRY_SECTOR_COUNTS as readonly string[]).includes(str)) {
    return str as SymmetrySectorCount
  }
  return 'off'
}

export const createDefaultSceneGuides = (
  canvasWidth: number,
  canvasHeight: number
): SceneGuidesState => ({
  symmetry: 'off',
  lastSymmetryMode: DEFAULT_SYMMETRY_SECTOR,
  rotationRad: 0,
  originX: canvasWidth / 2,
  originY: canvasHeight / 2,
  showOriginHandle: true,
})

export const isGuidesActive = (state: SceneGuidesState): boolean => state.symmetry !== 'off'

const TOOLS_WITHOUT_SYMMETRY = new Set([
  'bucket',
  'magicWand',
  'pipette',
  'ruler',
  'undo',
  'redo',
  'paper',
  'clear',
])

export const toolSupportsSymmetry = (toolName: string | undefined): boolean =>
  Boolean(toolName && !TOOLS_WITHOUT_SYMMETRY.has(toolName))
