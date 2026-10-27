import { deepCopy } from 'utils/jsUtils'
import {
  createDefaultSceneGuides,
  DEFAULT_SYMMETRY_SECTOR,
  normalizeSymmetryMode,
  SceneGuidesSnapshot,
  SceneGuidesState,
  SymmetryMode,
} from './guideTypes'

export let guidesState: SceneGuidesState = createDefaultSceneGuides(1, 1)

export const resetGuidesState = (canvasWidth: number, canvasHeight: number) => {
  guidesState = createDefaultSceneGuides(canvasWidth, canvasHeight)
}

export const applyGuidesSnapshot = (
  snapshot: Partial<SceneGuidesSnapshot> | undefined,
  canvasWidth: number,
  canvasHeight: number
) => {
  const base = createDefaultSceneGuides(canvasWidth, canvasHeight)
  if (!snapshot) {
    guidesState = base
    return
  }
  let rotationRad =
    typeof snapshot.rotationRad === 'number' ? snapshot.rotationRad : base.rotationRad
  const rawSymmetry = snapshot.symmetry as unknown
  let symmetry = normalizeSymmetryMode(rawSymmetry)
  if (rawSymmetry === 'horizontal') {
    symmetry = '2'
    rotationRad = Math.PI / 2
  } else if (rawSymmetry === 'vertical') {
    symmetry = '2'
    rotationRad = 0
  }
  const lastSymmetryMode = normalizeSymmetryMode(
    snapshot.lastSymmetryMode ?? (symmetry !== 'off' ? symmetry : base.lastSymmetryMode)
  )
  guidesState = {
    symmetry,
    lastSymmetryMode:
      lastSymmetryMode !== 'off'
        ? lastSymmetryMode
        : symmetry !== 'off'
          ? symmetry
          : base.lastSymmetryMode,
    rotationRad,
    originX: typeof snapshot.originX === 'number' ? snapshot.originX : base.originX,
    originY: typeof snapshot.originY === 'number' ? snapshot.originY : base.originY,
    showOriginHandle:
      typeof snapshot.showOriginHandle === 'boolean'
        ? snapshot.showOriginHandle
        : base.showOriginHandle,
  }
}

export const getGuidesSnapshot = (): SceneGuidesSnapshot => deepCopy(guidesState)

export const setSymmetryMode = (symmetry: SymmetryMode) => {
  guidesState.symmetry = symmetry
  if (symmetry !== 'off') {
    guidesState.lastSymmetryMode = symmetry
  }
}

export const disableSymmetryGuides = () => {
  if (guidesState.symmetry !== 'off') {
    guidesState.lastSymmetryMode = guidesState.symmetry
  }
  guidesState.symmetry = 'off'
}

export const restoreLastSymmetryMode = (): boolean => {
  const mode =
    guidesState.lastSymmetryMode === 'off' ? DEFAULT_SYMMETRY_SECTOR : guidesState.lastSymmetryMode
  guidesState.lastSymmetryMode = mode
  guidesState.symmetry = mode
  return true
}

export const setGuidesOrigin = (originX: number, originY: number) => {
  guidesState.originX = originX
  guidesState.originY = originY
}

export const setShowOriginHandle = (show: boolean) => {
  guidesState.showOriginHandle = show
}

export const setGuidesRotationRad = (rotationRad: number) => {
  guidesState.rotationRad = rotationRad
}
