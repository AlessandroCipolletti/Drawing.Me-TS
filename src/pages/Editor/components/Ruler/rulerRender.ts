import Params from 'main/Params'
import {
  round,
  degToFirstQuadrant,
  getScopeCoefficientBetweenTwoPoints,
  getDistanceBetweenTwoPoints,
  getAngleRadBetweenTwoPoints,
  roundAngleForSteps,
} from 'utils/mathUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { deepCopy } from 'utils/jsUtils'
import { RulerRefs } from './RulerView'

export const config = {
  colorsPickerHeight: 45,
  rulerMinOffset: 50,
  rulerWidth: 2.5,
  rulerHeight: 0,
  rulerRotationStep: 1.5,
  rulerRotationInterval: 45,
  rulerMarginToDraw: 40,
}

export interface RulerState {
  isVisible: boolean
  draggable: boolean
  translated: boolean
  touchDown: boolean
  isNearSide: boolean
  dragged: boolean
  dragMode: 'drag' | 'rotate'
  rulerTransformOrigin: string
  containerOffset: {
    left: number
    right: number
  }
  rulerWidth: number
  currentCoefficientM: number
  sideRulerOriginX: number
  sideRulerOriginY: number
  dragCurrentX: number
  dragCurrentY: number
  startCenterX: number
  startCenterY: number
  currentRotation: number
  dragStartX: number
  dragStartY: number
  dragLastX: number
  dragLastY: number
  startOriginX: number
  startOriginY: number
  startAngle: number
  gestureOriginX: number
  gestureOriginY: number
  currentCenterX: number
  currentCenterY: number
  buttonsTouchStartTime: number
}

const initialState: RulerState = {
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

export let state: RulerState = deepCopy(initialState)

export const resetRulerState = () => {
  state = deepCopy(initialState)
}

export const refs: RulerRefs = {
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

export const rotationToLabel = (deg: number) => Math.trunc(degToFirstQuadrant(deg))

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

export const refreshRulerBoundsCache = () => {
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
  ensureRulerStartOriginInitialized()
  requestAnimationFrame(() => {
    ensureRulerStartOriginInitialized()
    refreshRulerBoundsCache()
  })
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

export const ensureRulerStartOriginInitialized = () => {
  if (state.startOriginX === 0 && refs.rulerOrigin && refs.rulerCenter) {
    const rulerOriginCoord = refs.rulerOrigin.getBoundingClientRect()
    const rulerCenterCoord = refs.rulerCenter.getBoundingClientRect()
    if (rulerOriginCoord.left !== 0 || rulerOriginCoord.top !== 0) {
      state.startOriginX = round(rulerOriginCoord.left, 1)
      state.startOriginY = round(rulerOriginCoord.top, 1)
      state.startCenterX = round(rulerCenterCoord.left + rulerCenterCoord.width / 2, 1)
      state.startCenterY = round(rulerCenterCoord.top + rulerCenterCoord.height / 2, 1)
    }
  }
}

export const syncRulerCenterTransformOrigin = () => {
  if (!refs.rulerCenter || !refs.ruler) return
  ensureRulerStartOriginInitialized()
  if (state.rulerTransformOrigin !== '') {
    const rulerCenterCoord = refs.rulerCenter.getBoundingClientRect()
    const centerX = rulerCenterCoord.left + rulerCenterCoord.width / 2
    const centerY = rulerCenterCoord.top + rulerCenterCoord.height / 2
    if (state.startCenterX !== 0 || state.startCenterY !== 0) {
      state.dragCurrentX = round(centerX - state.startCenterX, 1)
      state.dragCurrentY = round(centerY - state.startCenterY, 1)
      state.dragLastX = state.dragCurrentX
      state.dragLastY = state.dragCurrentY
    }
    state.rulerTransformOrigin = ''
  }
  refs.ruler.style.transformOrigin = '50% 50%'
}

export const toggleDragMode = () => {
  if (!refs.rulerLevel || !refs.rulerCenter || !refs.ruler) return
  ensureRulerStartOriginInitialized()
  if (state.dragMode === 'drag') {
    state.dragMode = 'rotate'
    refs.rulerLevel.classList.add('editor__tool-ruler-level-selected')
    refs.rulerLevel.classList.remove('editor__tool-ruler-level')
    syncRulerCenterTransformOrigin()
    refs.ruler.style.transform = `translate3d(${state.dragCurrentX}px, ${state.dragCurrentY}px, 0px) rotateZ(${state.currentRotation}deg)`
  } else {
    state.dragMode = 'drag'
    refs.rulerLevel.classList.add('editor__tool-ruler-level')
    refs.rulerLevel.classList.remove('editor__tool-ruler-level-selected')
  }
  state.dragLastX = state.dragCurrentX
  state.dragLastY = state.dragCurrentY
  state.dragStartX = state.dragStartY = state.gestureOriginX = state.gestureOriginY = -1
  state.startAngle = 0
  refreshRulerBoundsCache()
}

export const rotate = (perpendicular: boolean) => {
  if (!refs.rulerCenter || !refs.ruler || !refs.rulerLevel || !refs.rulerLevelValue) return
  ensureRulerStartOriginInitialized()
  if (perpendicular) {
    state.currentRotation = roundAngleForSteps(
      round((state.currentRotation + 90) % 360, 2),
      config.rulerRotationStep,
      config.rulerRotationInterval
    )
  } else {
    if (state.currentRotation % 90 === 0) {
      return
    }
    state.currentRotation = roundAngleForSteps(
      round(180 - state.currentRotation, 2),
      config.rulerRotationStep,
      config.rulerRotationInterval
    )
  }
  syncRulerCenterTransformOrigin()
  refs.rulerLevel.style.transform = `rotateZ(${-state.currentRotation}deg)`
  refs.rulerLevelValue.innerHTML = `${rotationToLabel(state.currentRotation)}&#186;`
  refs.ruler.style.transform = `translate3d(${state.dragCurrentX}px, ${state.dragCurrentY}px, 0px) rotateZ(${state.currentRotation}deg)`
  state.dragLastX = state.dragCurrentX
  state.dragLastY = state.dragCurrentY
  state.dragStartX = state.dragStartY = state.gestureOriginX = state.gestureOriginY = -1
  state.startAngle = 0
  refreshRulerBoundsCache()
}

export const initRulerDimensionAndPosition = () => {
  if (!refs.ruler || !refs.rulerLevel || !refs.rulerLevelValue) return
  state.rulerWidth = config.rulerWidth * Math.max(Params.width, Params.height)
  refs.ruler.style.width = `${state.rulerWidth}px`
  refs.ruler.style.marginLeft = `${-state.rulerWidth / 2}px`
  state.touchDown = false
  state.translated = false
  state.dragged = false
  state.rulerTransformOrigin = ''
  refs.ruler.style.transformOrigin = '50% 50%'
  state.startOriginX = state.startOriginY = state.startCenterX = state.startCenterY = 0
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
