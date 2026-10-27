import Params from 'main/Params'
import { preventDefault } from 'utils/domUtils'
import { getNumberInBetween, round } from 'utils/mathUtils'
import { guidesState, setGuidesOrigin, setGuidesRotationRad } from './guidesState'
import {
  GUIDE_ROTATION_SNAP_TOLERANCE_RAD,
  normalizeAngle,
  rotationRadFromOriginToPoint,
  snapGuideRotationRad,
} from './symmetryMath'

export type TouchCoordsFn = (e: Event) => [number, number]

let originCleanupFn: (() => void) | null = null
let rotationCleanupFn: (() => void) | null = null

type PointerLikeEvent = Event & { pointerId?: number }

const trySetPointerCapture = (el: HTMLElement, e: PointerLikeEvent) => {
  if (typeof e.pointerId !== 'number' || !el.setPointerCapture) return
  try {
    el.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
}

const tryReleasePointerCapture = (el: HTMLElement, e: PointerLikeEvent) => {
  if (typeof e.pointerId !== 'number' || !el.releasePointerCapture) return
  try {
    el.releasePointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
}

const attachDocumentPointerDrag = (
  el: HTMLElement,
  onStart: (e: Event) => boolean | void,
  onMove: (e: Event) => void,
  onEnd: (e: Event) => void
) => {
  let moveHandler: ((e: Event) => void) | null = null
  let endHandler: ((e: Event) => void) | null = null

  const detach = () => {
    if (moveHandler) {
      document.removeEventListener(Params.eventMove, moveHandler)
    }
    if (endHandler) {
      document.removeEventListener(Params.eventEnd, endHandler)
      if (Params.eventCanceled) {
        document.removeEventListener(Params.eventCanceled, endHandler)
      }
    }
    moveHandler = null
    endHandler = null
  }

  const handleStart = (e: Event) => {
    if (onStart(e) === false) return
    trySetPointerCapture(el, e as PointerLikeEvent)
    moveHandler = (moveEvent: Event) => {
      preventDefault(moveEvent)
      onMove(moveEvent)
    }
    endHandler = (endEvent: Event) => {
      preventDefault(endEvent)
      tryReleasePointerCapture(el, endEvent as PointerLikeEvent)
      onEnd(endEvent)
      detach()
    }
    document.addEventListener(Params.eventMove, moveHandler)
    document.addEventListener(Params.eventEnd, endHandler)
    if (Params.eventCanceled) {
      document.addEventListener(Params.eventCanceled, endHandler)
    }
  }

  el.addEventListener(Params.eventStart, handleStart)
  return () => {
    detach()
    el.removeEventListener(Params.eventStart, handleStart)
  }
}

export const bindGuidesOriginBullet = (
  bulletEl: HTMLElement | null,
  getTouchCoords: TouchCoordsFn,
  getCanvasSize: () => { width: number; height: number },
  onOriginChanged: () => void,
  onOriginDragEnd?: () => void
) => {
  originCleanupFn?.()
  originCleanupFn = null
  if (!bulletEl) return

  let offsetX = 0
  let offsetY = 0

  originCleanupFn = attachDocumentPointerDrag(
    bulletEl,
    (e) => {
      if (guidesState.symmetry === 'off' || !guidesState.showOriginHandle) return false
      preventDefault(e)
      e.stopPropagation()
      bulletEl.classList.add('editor-guides__origin-bullet--dragging')

      const [startX, startY] = getTouchCoords(e)
      const dx = startX - guidesState.originX
      const dy = startY - guidesState.originY
      const maxOffset = 80 * Params.pxScale
      if (Math.hypot(dx, dy) <= maxOffset) {
        offsetX = dx
        offsetY = dy
      } else {
        offsetX = 0
        offsetY = 0
      }
      return true
    },
    (moveEvent) => {
      if (!bulletEl.classList.contains('editor-guides__origin-bullet--dragging')) return
      const [px, py] = getTouchCoords(moveEvent)
      const { width, height } = getCanvasSize()
      if (width <= 0 || height <= 0) return
      const nx = getNumberInBetween(0, width, round(px - offsetX, 1), 1)
      const ny = getNumberInBetween(0, height, round(py - offsetY, 1), 1)
      setGuidesOrigin(nx, ny)
      onOriginChanged()
    },
    () => {
      if (!bulletEl.classList.contains('editor-guides__origin-bullet--dragging')) return
      bulletEl.classList.remove('editor-guides__origin-bullet--dragging')
      onOriginDragEnd?.()
    }
  )
}

export const bindGuidesRotationBullet = (
  bulletEl: HTMLElement | null,
  getTouchCoords: TouchCoordsFn,
  onRotationChanged: () => void,
  onRotationDragEnd?: () => void
) => {
  rotationCleanupFn?.()
  rotationCleanupFn = null
  if (!bulletEl) return

  let dragStartRotation = 0
  let dragStartPointerRotation = 0
  let dragging = false

  const applyRotation = (rad: number, dragPhase: 'move' | 'end') => {
    let next = rad
    next =
      dragPhase === 'end'
        ? snapGuideRotationRad(guidesState.symmetry, next)
        : snapGuideRotationRad(guidesState.symmetry, next, GUIDE_ROTATION_SNAP_TOLERANCE_RAD)
    setGuidesRotationRad(next)
    onRotationChanged()
  }

  const rotationFromEvent = (e: Event) => {
    const [px, py] = getTouchCoords(e)
    return rotationRadFromOriginToPoint(guidesState.originX, guidesState.originY, px, py)
  }

  rotationCleanupFn = attachDocumentPointerDrag(
    bulletEl,
    (e) => {
      if (guidesState.symmetry === 'off' || !guidesState.showOriginHandle) return false
      preventDefault(e)
      e.stopPropagation()
      dragging = true
      dragStartRotation = guidesState.rotationRad
      dragStartPointerRotation = rotationFromEvent(e)
      bulletEl.classList.add('editor-guides__rotation-bullet--dragging')
      applyRotation(
        normalizeAngle(
          dragStartRotation + normalizeAngle(rotationFromEvent(e) - dragStartPointerRotation)
        ),
        'move'
      )
      return true
    },
    (moveEvent) => {
      if (!dragging) return
      const pointerRot = rotationFromEvent(moveEvent)
      applyRotation(
        normalizeAngle(dragStartRotation + normalizeAngle(pointerRot - dragStartPointerRotation)),
        'move'
      )
    },
    (endEvent) => {
      if (!dragging) return
      dragging = false
      const pointerRot = rotationFromEvent(endEvent)
      applyRotation(
        normalizeAngle(dragStartRotation + normalizeAngle(pointerRot - dragStartPointerRotation)),
        'end'
      )
      bulletEl.classList.remove('editor-guides__rotation-bullet--dragging')
      onRotationDragEnd?.()
    }
  )
}

export const clearGuidesTouch = () => {
  originCleanupFn?.()
  originCleanupFn = null
  rotationCleanupFn?.()
  rotationCleanupFn = null
}
