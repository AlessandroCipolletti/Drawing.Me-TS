import * as Coworking from 'modules/Coworking'
import { getGuidesSnapshot, applyGuidesSnapshot } from './guidesState'
import type { SceneGuidesSnapshot } from './guideTypes'

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let onApplied: (() => void) | null = null

export const setGuidesCoworkingRedraw = (fn: () => void) => {
  onApplied = fn
}

export const sendSceneGuidesIfCoworking = (canvasWidth: number, canvasHeight: number) => {
  if (!Coworking.isOpen()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    Coworking.sendSceneGuides(getGuidesSnapshot())
  }, 100)
  void canvasWidth
  void canvasHeight
}

export const applyRemoteSceneGuides = (
  snapshot: SceneGuidesSnapshot,
  canvasWidth: number,
  canvasHeight: number
) => {
  applyGuidesSnapshot(snapshot, canvasWidth, canvasHeight)
  onApplied?.()
}

export const clearGuidesCoworking = () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = null
  onApplied = null
}
