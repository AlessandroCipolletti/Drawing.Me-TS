import tplRuler from './ruler.tpl?raw'
import './ruler.css'

import Params from 'main/Params'
import * as Tools from 'pages/Editor/components/Tools'
import {
  round,
  degToFirstQuadrant,
  getScopeCoefficientBetweenTwoPoints,
  getDistanceBetweenTwoPoints,
  getAngleRadBetweenTwoPoints,
  getAngleDegBetweenTwoPoints,
  roundAngleForSteps,
} from 'utils/mathUtils'
import {
  preventDefault,
  filterTouchesByTargets,
  getEventCoordX,
  getEventCoordY,
  loadTemplate,
} from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { cleanRefs, addRotationHandler, removeRotationHandler } from 'utils/moduleUtils'
import { deepCopy } from 'utils/jsUtils'
import { spacing } from 'main/Theme'
import { normalizeTouchOrPointerEvent } from 'utils/pointerEventsUtils/touchEventsUtils'

let onStart: ((touch: any, x: number, y: number) => void) | undefined
let onMove: ((touch: any, x: number, y: number) => void) | undefined
let onEnd: ((touch?: any, x?: number, y?: number) => void) | undefined

const config = {
  colorsPickerHeight: 45,
  rulerMinOffset: 50,
  rulerWidth: 2.5,
  rulerHeight: 0,
  rulerRotationStep: 3,
  rulerRotationInterval: 45,
  rulerMarginToDraw: 40,
}

let state: Record<string, any> = {}
const initialState = {
  isVisible: false,
  draggable: true,
  translated: false,
  touchDown: false,
  isNearSide: false,
  dragged: false,
  dragMode: 'drag',
  rulerTransformOrigin: '',
  containerOffset: {
    left: 0,
    right: 0,
  },
  rulerWidth: 0,
  currentCoefficientM: 0,
  sideRulerOriginX: 0,
  sideRulerOriginY: 0,
  dragCurrentX: 0,
  dragCurrentY: 0,
  startCenterX: 0,
  startCenterY: 0,
  currentRotation: 0,
  dragStartX: 0,
  dragStartY: 0,
  dragLastX: 0,
  dragLastY: 0,
  startOriginX: 0,
  startOriginY: 0,
  startAngle: 0,
  gestureOriginX: 0,
  gestureOriginY: 0,
  currentCenterX: 0,
  currentCenterY: 0,
  buttonsTouchStartTime: 0,
}

const refs: {
  ruler: HTMLElement | null
  rulerOrigin: HTMLElement | null
  rulerBottom: HTMLElement | null
  rulerLevel: HTMLElement | null
  rulerCenter: HTMLElement | null
  rulerStart: HTMLElement | null
  rulerLevelValue: HTMLElement | null
  rulerGestureOne: HTMLElement | null
  rulerGestureTwo: HTMLElement | null
  perpendicularButton: HTMLElement | null
  specularButton: HTMLElement | null
} = {
  ruler: null,
  rulerOrigin: null,
  rulerBottom: null,
  rulerLevel: null,
  rulerCenter: null,
  rulerStart: null,
  rulerLevelValue: null,
  rulerGestureOne: null,
  rulerGestureTwo: null,
  perpendicularButton: null,
  specularButton: null,
}

const rotationToLabel = (deg: number) => Math.trunc(degToFirstQuadrant(deg))

let cachedRects: {
  center: { left: number; top: number } | null
  start: { left: number; top: number } | null
  origin: { left: number; top: number } | null
  bottom: { left: number; top: number } | null
} = {
  center: null,
  start: null,
  origin: null,
  bottom: null,
}

const refreshRulerBoundsCache = () => {
  if (refs.rulerCenter && refs.rulerStart && refs.rulerOrigin && refs.rulerBottom) {
    const c = refs.rulerCenter.getBoundingClientRect()
    const s = refs.rulerStart.getBoundingClientRect()
    const o = refs.rulerOrigin.getBoundingClientRect()
    const b = refs.rulerBottom.getBoundingClientRect()
    cachedRects = {
      center: { left: c.left, top: c.top },
      start: { left: s.left, top: s.top },
      origin: { left: o.left, top: o.top },
      bottom: { left: b.left, top: b.top },
    }
    state.currentCoefficientM = round(
      getScopeCoefficientBetweenTwoPoints(s.left, s.top, c.left, c.top),
      4
    )
  }
}

export const show = () => {
  if (refs.ruler) fadeInElements(refs.ruler)
  state.isVisible = true
  requestAnimationFrame(refreshRulerBoundsCache)
}

export const hide = () => {
  if (refs.ruler) fadeOutElements(refs.ruler)
  state.isVisible = false
}

export const lock = () => (state.draggable = false)

export const unlock = () => (state.draggable = true)

export const checkCoordNearRuler = (x: number, y: number, inside = false): boolean => {
  if (
    state.isVisible &&
    refs.rulerCenter &&
    refs.rulerStart &&
    refs.rulerOrigin &&
    refs.rulerBottom
  ) {
    if (!cachedRects.center || !cachedRects.start || !cachedRects.origin || !cachedRects.bottom) {
      refreshRulerBoundsCache()
    }
    const centerCoord = cachedRects.center!
    const startCoord = cachedRects.start!
    const rulerOriginCoord = cachedRects.origin!
    const rulerBottomCoord = cachedRects.bottom!
    if (
      getDistanceBetweenTwoPoints(x, y, rulerOriginCoord.left, rulerOriginCoord.top) <
      getDistanceBetweenTwoPoints(x, y, rulerBottomCoord.left, rulerBottomCoord.top)
    ) {
      state.sideRulerOriginX = round(rulerOriginCoord.left)
      state.sideRulerOriginY = -round(rulerOriginCoord.top)
    } else {
      state.sideRulerOriginX = round(rulerBottomCoord.left)
      state.sideRulerOriginY = -round(rulerBottomCoord.top)
    }

    const dist = Math.abs(
      Math.abs(
        round(
          getDistanceBetweenTwoPoints(x, y, centerCoord.left, centerCoord.top) *
            Math.sin(
              getAngleRadBetweenTwoPoints(x, y, centerCoord.left, centerCoord.top) -
                getAngleRadBetweenTwoPoints(
                  startCoord.left,
                  startCoord.top,
                  centerCoord.left,
                  centerCoord.top
                )
            )
        )
      ) -
        config.rulerHeight / 2
    )
    if (inside) {
      return dist <= config.rulerMarginToDraw / 2
    } else {
      return dist <= config.rulerMarginToDraw
    }
  }
  return false
}

export const getCoordsNearRuler = (() => {
  let m: number
  let xo: number
  let yo: number
  let x: number
  let y: number
  return (xp: number, yp: number, offsetX = 0, offsetY = 0): [number, number] => {
    xp += offsetX
    yp += offsetY
    yp *= -1
    m = state.currentCoefficientM
    xo = state.sideRulerOriginX
    yo = state.sideRulerOriginY
    if (m === 0) {
      x = xp
      y = -yo
    } else if (isFinite(m)) {
      x = round((m * xo - yo + yp + xp / m) / (1 / m + m), 1)
      y = -round(m * x - m * xo + yo, 1)
    } else {
      x = xo
      y = -yp
    }
    return [round(x - offsetX, 1), round(y - offsetY, 1)]
  }
})()

const ensureRulerStartOriginInitialized = () => {
  if (state.startOriginX === 0 && refs.rulerOrigin) {
    const rulerOriginCoord = refs.rulerOrigin.getBoundingClientRect()
    if (rulerOriginCoord.left !== 0 || rulerOriginCoord.top !== 0) {
      state.startOriginX = round(rulerOriginCoord.left, 1)
      state.startOriginY = round(rulerOriginCoord.top, 1)
      state.startCenterX = state.startOriginX + state.rulerWidth / 2
      state.startCenterY = state.startOriginY + config.rulerHeight / 2
    }
  }
}

const toggleDragMode = () => {
  if (!refs.rulerLevel || !refs.rulerCenter || !refs.ruler) return
  ensureRulerStartOriginInitialized()
  if (state.dragMode === 'drag') {
    state.dragMode = 'rotate'
    refs.rulerLevel.classList.add('editor__tool-ruler-level-selected')
    refs.rulerLevel.classList.remove('editor__tool-ruler-level')
    const rulerOriginCoord = refs.rulerCenter.getBoundingClientRect()
    if (state.startCenterX !== 0 || state.startCenterY !== 0) {
      state.dragCurrentX = round(rulerOriginCoord.left - state.startCenterX, 1)
      state.dragCurrentY = round(rulerOriginCoord.top - state.startCenterY, 1)
    }
    state.rulerTransformOrigin = ''
    refs.ruler.style.transformOrigin = '50% 50%'
    refs.ruler.style.transform = `translate3d(${state.dragCurrentX}px, ${state.dragCurrentY}px, 0px) rotateZ(${state.currentRotation}deg)`
  } else {
    state.dragMode = 'drag'
    refs.rulerLevel.classList.add('editor__tool-ruler-level')
    refs.rulerLevel.classList.remove('editor__tool-ruler-level-selected')
  }
  refreshRulerBoundsCache()
}

const rotate = (perpendicular: boolean) => {
  if (!refs.rulerCenter || !refs.ruler || !refs.rulerLevel || !refs.rulerLevelValue) return
  ensureRulerStartOriginInitialized()
  if (perpendicular) {
    state.currentRotation = roundAngleForSteps(
      (state.currentRotation + 90) % 360,
      config.rulerRotationStep,
      config.rulerRotationInterval
    )
  } else {
    if (state.currentRotation % 90 === 0) {
      return
    }
    state.currentRotation = roundAngleForSteps(
      180 - state.currentRotation,
      config.rulerRotationStep,
      config.rulerRotationInterval
    )
  }
  const rulerOriginCoord = refs.rulerCenter.getBoundingClientRect()
  if (state.startCenterX !== 0 || state.startCenterY !== 0) {
    state.dragCurrentX = round(rulerOriginCoord.left - state.startCenterX, 1)
    state.dragCurrentY = round(rulerOriginCoord.top - state.startCenterY, 1)
  }
  state.rulerTransformOrigin = ''
  refs.ruler.style.transformOrigin = '50% 50%'
  refs.rulerLevel.style.transform = `rotateZ(${-state.currentRotation}deg)`
  refs.rulerLevelValue.innerHTML = `${rotationToLabel(state.currentRotation)}&#186;`
  refs.ruler.style.transform = `translate3d(${state.dragCurrentX}px, ${state.dragCurrentY}px, 0px) rotateZ(${state.currentRotation}deg)`
  state.dragLastX = state.dragCurrentX
  state.dragLastY = state.dragCurrentY
  state.dragStartX = state.dragStartY = state.gestureOriginX = state.gestureOriginY = -1
  state.startAngle = 0
  refreshRulerBoundsCache()
}

const activeRulerPointers = new Map<number, any>()

const getRulerTouches = (e: any, phase: 'start' | 'move' | 'end'): any[] => {
  const allowedTargets = [
    refs.ruler,
    refs.rulerLevelValue,
    refs.perpendicularButton,
    refs.specularButton,
  ]
  if (e && e.touches) {
    return filterTouchesByTargets(e, allowedTargets).map(normalizeTouchOrPointerEvent)
  }
  const pid = e?.pointerId ?? e?.identifier ?? 0
  if (phase === 'start') {
    const matched = filterTouchesByTargets(e, allowedTargets)
    if (matched.length > 0) {
      const norm = normalizeTouchOrPointerEvent(e)
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
      const norm = normalizeTouchOrPointerEvent(e)
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

const onTouchStart = (e: any) => {
  preventDefault(e)
  const touches = getRulerTouches(e, 'start')
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

const onTouchMove = (e: any) => {
  preventDefault(e)
  const touches = getRulerTouches(e, 'move')
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

const onTouchEnd = (e: any) => {
  preventDefault(e)
  const pid = e?.pointerId ?? e?.identifier ?? 0
  const endingTouch = activeRulerPointers.get(pid) || normalizeTouchOrPointerEvent(e)
  const touches = getRulerTouches(e, 'end')
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

const onButtonsTouchStart = (e: any) => {
  if (!e.touches || e.touches.length === 1) {
    state.buttonsTouchStartTime = Date.now()
  }
}

const onButtonsTouchEnd = (e: any) => {
  if (
    state.buttonsTouchStartTime + 300 > Date.now() &&
    state.dragged === false &&
    (!e.touches || e.touches.length === 0)
  ) {
    preventDefault(e)
    state.buttonsTouchStartTime = 0
    state.touchDown = false
    const target = e.target || e.touches?.[0]?.target
    if (target === refs.rulerLevelValue) {
      toggleDragMode()
    } else if (target === refs.perpendicularButton) {
      rotate(true)
    } else if (target === refs.specularButton) {
      rotate(false)
    }
  }
}

const initRulerDimensionAndPosition = () => {
  if (!refs.ruler || !refs.rulerLevel || !refs.rulerLevelValue) return
  state.rulerWidth = config.rulerWidth * Math.max(Params.width, Params.height)
  refs.ruler.style.width = `${state.rulerWidth}px`
  refs.ruler.style.marginLeft = `${-state.rulerWidth / 2}px`
  state.touchDown = false
  state.startOriginX = state.startOriginY = 0
  state.dragCurrentX =
    state.dragCurrentY =
    state.currentRotation =
    state.dragLastX =
    state.dragLastY =
    state.startAngle =
      0
  state.dragStartX = state.dragStartY = state.gestureOriginX = state.gestureOriginY = -1
  refs.ruler.style.transform = `translate3d(${state.dragCurrentX}px, ${state.dragCurrentY}px, 0px) rotateZ(${state.currentRotation}deg)`
  refs.rulerLevel.style.transform = `rotateZ(${-state.currentRotation}deg)`
  refs.rulerLevelValue.innerHTML = `${rotationToLabel(state.currentRotation)}&#186;`
  refreshRulerBoundsCache()
}

const onRotate = () => {
  initRulerDimensionAndPosition()
  if (state.isVisible) {
    Tools.clickButton('ruler')
  }
}

const initDom = async (moduleContainer: HTMLElement) => {
  const dom = (await loadTemplate(tplRuler, {}, moduleContainer)) as HTMLElement[]
  refs.ruler = dom[0]
  refs.rulerOrigin = refs.ruler.querySelector('.editor__tool-ruler-origin')
  refs.rulerCenter = refs.ruler.querySelector('.editor__tool-ruler-center')
  refs.rulerStart = refs.ruler.querySelector('.editor__tool-ruler-start')
  refs.rulerBottom = refs.ruler.querySelector('.editor__tool-ruler-bottom')
  refs.rulerLevel = refs.ruler.querySelector('.editor__tool-ruler-level')
  refs.rulerLevelValue = refs.ruler.querySelector('.editor__tool-ruler-level-value')
  refs.perpendicularButton = refs.ruler.querySelector('.editor__tool-ruler-perpendicular')
  refs.specularButton = refs.ruler.querySelector('.editor__tool-ruler-specular')
  refs.rulerGestureOne = dom[1]
  refs.rulerGestureTwo = dom[2]

  initRulerDimensionAndPosition()

  state.containerOffset = {
    left: spacing.EDITOR_TOOLS_WIDTH,
    right: 0,
  }
  config.rulerHeight = spacing.RULER_HEIGHT

  refs.ruler.addEventListener(Params.eventStart, onTouchStart)
  refs.rulerLevelValue?.addEventListener(Params.eventStart, onButtonsTouchStart)
  refs.rulerLevelValue?.addEventListener(Params.eventEnd, onButtonsTouchEnd)
  if (!Params.isMobile) {
    toggleDragMode()
  }
  refs.perpendicularButton?.addEventListener(Params.eventStart, onButtonsTouchStart)
  refs.perpendicularButton?.addEventListener(Params.eventEnd, onButtonsTouchEnd)
  refs.specularButton?.addEventListener(Params.eventStart, onButtonsTouchStart)
  refs.specularButton?.addEventListener(Params.eventEnd, onButtonsTouchEnd)
  if (Params.isMobile) {
    refs.ruler.addEventListener('gesturestart', preventDefault, true)
    refs.ruler.addEventListener('gesturechange', preventDefault, true)
    refs.ruler.addEventListener('gestureend', preventDefault, true)
  }
  addRotationHandler(onRotate)
}

export const init = async (
  moduleContainer: HTMLElement,
  events: {
    touchStart: (touch: any, x: number, y: number) => void
    touchMove: (touch: any, x: number, y: number) => void
    touchEnd: (touch?: any, x?: number, y?: number) => void
  }
) => {
  onStart = events.touchStart
  onMove = events.touchMove
  onEnd = events.touchEnd
  state = deepCopy(initialState)
  config.rulerMinOffset = 50 / Params.viewportScale
  config.rulerMarginToDraw = 40 / Params.viewportScale
  await initDom(moduleContainer)
}

export const remove = () => {
  removeRotationHandler(onRotate)
  activeRulerPointers.clear()
  onStart = onMove = onEnd = undefined
  state = {}
  cleanRefs(refs)
}
