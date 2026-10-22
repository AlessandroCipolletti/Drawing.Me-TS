import { debounce } from 'utils/jsUtils'
import { round } from 'utils/mathUtils'
import { preventDefault, getEventCoordX, getEventCoordY } from 'utils/domUtils'
import Params from 'main/Params'
import { PointerGestureCallbacks } from './touchEventsUtils'

const TIME_TO_END_SCROLL_GESTURE = 50
const WHEEL_ZOOM_SENSITIVITY = 0.005

export const handleDesktopEventsWithGesture = (
  target: HTMLElement,
  {
    onGestureStart = () => {},
    onGestureChange = () => {},
    onGestureEnd = () => {},
    isWheelBlocked = () => false,
  }: PointerGestureCallbacks = {}
) => {
  let isScrolling = false
  let currentGestureS = 1
  let currentGestureX = 0
  let currentGestureY = 0
  const currentGestureR = 0

  const debouncedStopScrolling = debounce(() => {
    onGestureEnd(currentGestureX, currentGestureY, currentGestureS, currentGestureR)
    isScrolling = false
    currentGestureS = 1
    currentGestureX = 0
    currentGestureY = 0
  }, TIME_TO_END_SCROLL_GESTURE)

  const onWheel = (e: any) => {
    if (isWheelBlocked() || (typeof e?.buttons === 'number' && e.buttons > 0)) {
      return
    }
    preventDefault(e)

    const deltaX = Number(e.deltaX) || 0
    const deltaY = Number(e.deltaY) || 0

    if (!isScrolling) {
      currentGestureX = getEventCoordX(e, 0)
      currentGestureY = getEventCoordY(e, 0)
      currentGestureS = 1
      onGestureStart(currentGestureX, currentGestureY, currentGestureS, 0)
      isScrolling = true
    }

    if (e.ctrlKey || e.metaKey || Math.abs(deltaY) >= Math.abs(deltaX)) {
      const stepFactor = Math.max(0.1, 1 - deltaY * WHEEL_ZOOM_SENSITIVITY)
      currentGestureS = Math.max(0.1, round(currentGestureS * stepFactor, 4))
    } else {
      currentGestureX -= deltaX
      currentGestureY -= deltaY
    }

    onGestureChange(currentGestureX, currentGestureY, currentGestureS, 0)
    debouncedStopScrolling()
  }

  target.addEventListener(Params.eventScroll, onWheel)
  return () => {
    target.removeEventListener?.(Params.eventScroll, onWheel)
  }
}
