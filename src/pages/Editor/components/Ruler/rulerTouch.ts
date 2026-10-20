import Params from 'main/Params'
import { spacing } from 'main/Theme'
import { PointerTouchEvent } from 'pages/Editor/editorTypes'
import {
  round,
  getDistanceBetweenTwoPoints,
  getAngleDegBetweenTwoPoints,
  roundAngleForSteps,
} from 'utils/mathUtils'
import {
  preventDefault,
  filterTouchesByTargets,
  getEventCoordX,
  getEventCoordY,
} from 'utils/domUtils'
import { normalizeTouchOrPointerEvent } from 'utils/pointerEventsUtils/touchEventsUtils'
import {
  checkCoordNearRuler,
  config,
  ensureRulerStartOriginInitialized,
  getCoordsNearRuler,
  lock,
  refreshRulerBoundsCache,
  refs,
  rotate,
  rotationToLabel,
  state,
  toggleDragMode,
  unlock,
} from './rulerRender'

export interface RulerStrokeEvents {
  touchStart: (touch: PointerTouchEvent, x: number, y: number) => void
  touchMove: (touch: PointerTouchEvent, x: number, y: number) => void
  touchEnd: (touch?: PointerTouchEvent, x?: number, y?: number) => void
}

let onStart: RulerStrokeEvents['touchStart'] | undefined
let onMove: RulerStrokeEvents['touchMove'] | undefined
let onEnd: RulerStrokeEvents['touchEnd'] | undefined

type NormalizedRulerTouch = PointerTouchEvent & {
  pointerId: number
  clientX: number
  clientY: number
  pageX: number
  pageY: number
  target: EventTarget | null
}

const activeRulerPointers = new Map<number, NormalizedRulerTouch>()

export const setRulerStrokeCallbacks = (events?: RulerStrokeEvents) => {
  onStart = events?.touchStart
  onMove = events?.touchMove
  onEnd = events?.touchEnd
}

export const clearRulerTouchState = () => {
  activeRulerPointers.clear()
  onStart = onMove = onEnd = undefined
}

type PointerOrTouchInput = Event & {
  touches?: TouchList | NormalizedRulerTouch[]
  pointerId?: number
  identifier?: number
}

const getRulerTouches = (
  e: PointerOrTouchInput,
  phase: 'start' | 'move' | 'end'
): NormalizedRulerTouch[] => {
  const allowedTargets = [
    refs.ruler,
    refs.rulerLevelValue,
    refs.perpendicularButton,
    refs.specularButton,
  ]
  if (e && e.touches) {
    return (filterTouchesByTargets(e, allowedTargets) as unknown as PointerOrTouchInput[]).map(
      (t) => normalizeTouchOrPointerEvent(t) as unknown as NormalizedRulerTouch
    )
  }
  const pid = e?.pointerId ?? e?.identifier ?? 0
  if (phase === 'start') {
    const matched = filterTouchesByTargets(e, allowedTargets)
    if (matched.length > 0) {
      const norm = normalizeTouchOrPointerEvent(e) as unknown as NormalizedRulerTouch
      activeRulerPointers.set(pid, {
        ...norm,
        pointerId: pid,
        clientX: getEventCoordX(e),
        clientY: getEventCoordY(e),
        pageX: getEventCoordX(e),
        pageY: getEventCoordY(e),
        target: e.target,
      })
    }
  } else if (phase === 'move') {
    const prev = activeRulerPointers.get(pid)
    if (prev) {
      const norm = normalizeTouchOrPointerEvent(e) as unknown as NormalizedRulerTouch
      activeRulerPointers.set(pid, {
        ...prev,
        ...norm,
        clientX: getEventCoordX(e),
        clientY: getEventCoordY(e),
        pageX: getEventCoordX(e),
        pageY: getEventCoordY(e),
        target: prev.target,
      })
    }
  } else {
    activeRulerPointers.delete(pid)
  }
  return Array.from(activeRulerPointers.values())
}

export const onTouchStart = (e: Event) => {
  preventDefault(e)
  const touches = getRulerTouches(e as PointerOrTouchInput, 'start')
  if (
    state.isNearSide === true ||
    state.draggable === false ||
    touches.length > 2 ||
    touches.length === 0
  ) {
    state.touchDown = false
    return
  }
  document.addEventListener(Params.eventMove, onTouchMove)
  document.addEventListener(Params.eventEnd, onTouchEnd)
  if (Params.eventCanceled) {
    document.addEventListener(Params.eventCanceled, onTouchEnd)
  }
  state.touchDown = true

  ensureRulerStartOriginInitialized()
  if (touches.length === 1) {
    let cursorX = getEventCoordX(touches, 0)
    let cursorY = getEventCoordY(touches, 0)
    if (checkCoordNearRuler(cursorX, cursorY, true)) {
      state.isNearSide = true
      lock()
      ;[cursorX, cursorY] = getCoordsNearRuler(cursorX, cursorY)
      onStart?.(touches[0], cursorX, cursorY)
    } else if (state.dragMode === 'drag' || touches[0].target === refs.rulerLevelValue) {
      state.dragStartX = cursorX
      state.dragStartY = cursorY
    } else if (refs.rulerCenter) {
      const rulerCenterCoord = refs.rulerCenter.getBoundingClientRect()
      state.currentCenterX = rulerCenterCoord.left
      state.currentCenterY = rulerCenterCoord.top
      state.dragCurrentX = round(rulerCenterCoord.left - state.startCenterX, 1)
      state.dragCurrentY = round(rulerCenterCoord.top - state.startCenterY, 1)
      state.startAngle =
        round(
          getAngleDegBetweenTwoPoints(
            rulerCenterCoord.left,
            rulerCenterCoord.top,
            cursorX,
            cursorY
          ),
          2
        ) - state.currentRotation
    }
  } else if (refs.rulerOrigin && refs.rulerGestureOne && refs.rulerGestureTwo) {
    const rulerOriginCoord = refs.rulerOrigin.getBoundingClientRect()
    state.translated = true
    state.dragLastX = state.dragCurrentX
    state.dragLastY = state.dragCurrentY
    refs.rulerGestureOne.style.left = `${round(touches[0].clientX, 1)}px`
    refs.rulerGestureOne.style.top = `${round(touches[0].clientY, 1)}px`
    refs.rulerGestureOne.style.transformOrigin = `${round(rulerOriginCoord.left - touches[0].clientX, 1)}px ${round(rulerOriginCoord.top - touches[0].clientY, 1)}px`
    refs.rulerGestureTwo.style.left = `${round(touches[1].clientX, 1)}px`
    refs.rulerGestureTwo.style.top = `${round(touches[1].clientY, 1)}px`
    refs.rulerGestureTwo.style.transformOrigin = `${round(rulerOriginCoord.left - touches[1].clientX, 1)}px ${round(rulerOriginCoord.top - touches[1].clientY, 1)}px`
    refs.rulerGestureOne.style.transform =
      refs.rulerGestureTwo.style.transform = `translate3d(${round(state.startOriginX - rulerOriginCoord.left, 1)}px, ${round(state.startOriginY - rulerOriginCoord.top, 1)}px, 0px) rotateZ(${-state.currentRotation}deg)`
    const gestureOneCoord = refs.rulerGestureOne.getBoundingClientRect()
    const gestureTwoCoord = refs.rulerGestureTwo.getBoundingClientRect()
    state.gestureOriginX = (gestureOneCoord.left + gestureTwoCoord.left) / 2
    state.gestureOriginY = (gestureOneCoord.top + gestureTwoCoord.top) / 2
    state.startAngle = round(
      getAngleDegBetweenTwoPoints(
        gestureOneCoord.left,
        gestureOneCoord.top,
        gestureTwoCoord.left,
        gestureTwoCoord.top
      ),
      2
    )
    state.rulerTransformOrigin = `${round(state.gestureOriginX - state.startOriginX, 1)}px ${round(state.gestureOriginY - state.startOriginY, 1)}px`
    refs.rulerGestureOne.style.cssText = refs.rulerGestureTwo.style.cssText = ''
  }
}

const onTouchMove = (e: Event) => {
  preventDefault(e)
  const touches = getRulerTouches(e as PointerOrTouchInput, 'move')
  if (touches.length > 2 || state.touchDown === false || touches.length === 0) {
    state.touchDown = false
    return
  }
  let cursorX: number
  let cursorY: number
  if (state.isNearSide) {
    ;[cursorX, cursorY] = getCoordsNearRuler(getEventCoordX(touches, 0), getEventCoordY(touches, 0))
    onMove?.(touches[0], cursorX, cursorY)
  } else if (state.draggable && refs.ruler && refs.rulerLevel && refs.rulerLevelValue) {
    if (touches.length === 1) {
      cursorX = getEventCoordX(touches, 0)
      cursorY = getEventCoordY(touches, 0)
      if (state.dragStartX === -1) {
        state.dragStartX = cursorX
        state.dragStartY = cursorY
      }
      if (state.dragMode === 'drag' || touches[0].target === refs.rulerLevelValue) {
        cursorX = round(state.dragLastX + cursorX - state.dragStartX, 1)
        cursorY = round(state.dragLastY + cursorY - state.dragStartY, 1)
        if (
          touches[0].target !== refs.ruler &&
          getDistanceBetweenTwoPoints(cursorX, cursorY, state.dragLastX, state.dragLastY) < 10
        ) {
          return
        }
        state.dragged = true
        state.dragCurrentX = cursorX
        state.dragCurrentY = cursorY
      } else {
        if (state.translated && refs.rulerCenter) {
          const rulerCenterCoord = refs.rulerCenter.getBoundingClientRect()
          state.currentCenterX = rulerCenterCoord.left
          state.currentCenterY = rulerCenterCoord.top
          state.dragCurrentX = round(rulerCenterCoord.left - state.startCenterX, 1)
          state.dragCurrentY = round(rulerCenterCoord.top - state.startCenterY, 1)
          state.startAngle =
            round(
              getAngleDegBetweenTwoPoints(
                rulerCenterCoord.left,
                rulerCenterCoord.top,
                cursorX,
                cursorY
              ),
              2
            ) - state.currentRotation
        }
        state.rulerTransformOrigin = ''
        refs.ruler.style.transformOrigin = '50% 50%'
        state.currentRotation = roundAngleForSteps(
          round(
            getAngleDegBetweenTwoPoints(
              state.currentCenterX,
              state.currentCenterY,
              cursorX,
              cursorY
            ) - state.startAngle,
            2
          ),
          config.rulerRotationStep,
          config.rulerRotationInterval
        )
        refs.rulerLevel.style.transform = `rotateZ(${-state.currentRotation}deg)`
        refs.rulerLevelValue.innerHTML = `${rotationToLabel(state.currentRotation)}&#186;`
      }
    } else {
      state.dragged = true
      state.dragCurrentX = round(
        (touches[0].clientX + touches[1].clientX) / 2 - state.gestureOriginX,
        1
      )
      state.dragCurrentY = round(
        (touches[0].clientY + touches[1].clientY) / 2 - state.gestureOriginY,
        1
      )
      state.currentRotation = roundAngleForSteps(
        round(
          getAngleDegBetweenTwoPoints(
            touches[0].clientX,
            touches[0].clientY,
            touches[1].clientX,
            touches[1].clientY
          ) - state.startAngle,
          2
        ),
        config.rulerRotationStep,
        config.rulerRotationInterval
      )
      refs.rulerLevel.style.transform = `rotateZ(${-state.currentRotation}deg)`
      refs.rulerLevelValue.innerHTML = `${rotationToLabel(state.currentRotation)}&#186;`
      state.dragStartX = state.dragStartY = -1
      refs.ruler.style.transformOrigin = state.rulerTransformOrigin
    }
    refs.ruler.style.transform = `translate3d(${state.dragCurrentX}px, ${state.dragCurrentY}px, 0px) rotateZ(${state.currentRotation}deg)`
  }
}

const onTouchEnd = (e: Event) => {
  preventDefault(e)
  const pointerEvent = e as PointerOrTouchInput
  const pid = pointerEvent?.pointerId ?? pointerEvent?.identifier ?? 0
  const endingTouch =
    activeRulerPointers.get(pid) ||
    (normalizeTouchOrPointerEvent(pointerEvent) as unknown as NormalizedRulerTouch)
  const touches = getRulerTouches(pointerEvent, 'end')
  if (touches.length === 0) {
    document.removeEventListener(Params.eventMove, onTouchMove)
    document.removeEventListener(Params.eventEnd, onTouchEnd)
    if (Params.eventCanceled) {
      document.removeEventListener(Params.eventCanceled, onTouchEnd)
    }
    state.touchDown = false
  }
  if (state.touchDown === false) {
    state.translated = state.dragged = false
    if (state.isNearSide) {
      unlock()
      state.isNearSide = false
      if (endingTouch) {
        const [endX, endY] = getCoordsNearRuler(
          getEventCoordX(endingTouch, 0),
          getEventCoordY(endingTouch, 0)
        )
        onEnd?.(endingTouch, endX, endY)
      } else {
        onEnd?.()
      }
    } else if (state.draggable === true && refs.rulerCenter && refs.ruler) {
      const centerCoord = refs.rulerCenter.getBoundingClientRect()
      let deltaX = 0
      let deltaY = 0
      const currentRotationRad = (state.currentRotation / 180) * Math.PI
      const outTop = spacing.HEADER_HEIGHT + config.rulerMinOffset - centerCoord.top
      const outBottom =
        centerCoord.top - (Params.height - config.rulerMinOffset - config.colorsPickerHeight)
      const outLeft = state.containerOffset.left + config.rulerMinOffset - centerCoord.left
      const outRight =
        centerCoord.left - (Params.width - state.containerOffset.right - config.rulerMinOffset)
      const maxDeltaX =
        Params.width - centerCoord.left - config.rulerMinOffset - state.containerOffset.right
      const minDeltaX = -centerCoord.left + state.containerOffset.left + config.rulerMinOffset
      const maxDeltaY =
        Params.height - centerCoord.top - config.rulerMinOffset - config.colorsPickerHeight
      const minDeltaY = -centerCoord.top + spacing.HEADER_HEIGHT + config.rulerMinOffset
      const sidesOut = [outTop, outBottom, outLeft, outRight]
        .sort((a, b) => a - b)
        .filter((a) => a > 0)

      if (sidesOut.length > 0) {
        let i = 0
        let side: number | false = sidesOut[i]
        while (side) {
          if (side === outTop) {
            deltaY = outTop
            deltaX = (deltaY * Math.cos(currentRotationRad)) / Math.sin(currentRotationRad)
          } else if (side === outBottom) {
            deltaY = -outBottom
            deltaX = (deltaY * Math.cos(currentRotationRad)) / Math.sin(currentRotationRad)
          } else if (side === outLeft) {
            deltaX = outLeft
            deltaY = (deltaX * Math.sin(currentRotationRad)) / Math.cos(currentRotationRad)
          } else {
            deltaX = -outRight
            deltaY = (deltaX * Math.sin(currentRotationRad)) / Math.cos(currentRotationRad)
          }
          i++
          if (
            sidesOut.length > i &&
            (deltaX > maxDeltaX || deltaX < minDeltaX || deltaY > maxDeltaY || deltaY < minDeltaY)
          ) {
            side = sidesOut[i]
          } else {
            side = false
          }
        }
        deltaX = Math.min(deltaX, maxDeltaX)
        deltaX = Math.max(deltaX, minDeltaX)
        deltaY = Math.min(deltaY, maxDeltaY)
        deltaY = Math.max(deltaY, minDeltaY)
        state.dragCurrentX += deltaX
        state.dragCurrentY += deltaY
        refs.ruler.style.transform = `translate3d(${state.dragCurrentX}px, ${state.dragCurrentY}px, 0px) rotateZ(${state.currentRotation}deg)`
      }
    }
  }
  state.dragLastX = state.dragCurrentX
  state.dragLastY = state.dragCurrentY
  state.dragStartX = state.dragStartY = state.gestureOriginX = state.gestureOriginY = -1
  state.startAngle = 0
  refreshRulerBoundsCache()
}

export const onButtonsTouchStart = (e: Event) => {
  const touchEvt = e as Event & { touches?: TouchList }
  if (!touchEvt.touches || touchEvt.touches.length === 1) {
    state.buttonsTouchStartTime = Date.now()
  }
}

export const onButtonsTouchEnd = (e: Event) => {
  const touchEvt = e as Event & { touches?: TouchList }
  if (
    state.buttonsTouchStartTime + 300 > Date.now() &&
    state.dragged === false &&
    (!touchEvt.touches || touchEvt.touches.length === 0)
  ) {
    preventDefault(e)
    state.buttonsTouchStartTime = 0
    state.touchDown = false
    const target = e.target || touchEvt.touches?.[0]?.target
    if (target === refs.rulerLevelValue) {
      toggleDragMode()
    } else if (target === refs.perpendicularButton) {
      rotate(true)
    } else if (target === refs.specularButton) {
      rotate(false)
    }
  }
}
