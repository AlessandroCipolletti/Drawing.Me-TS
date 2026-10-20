import { debounce } from 'utils/jsUtils'
import { preventDefault, getEventCoordX, getEventCoordY } from 'utils/domUtils'
import Params from 'main/Params'
import { PointerGestureCallbacks } from './touchEventsUtils'

const TIME_TO_END_SCROLL_GESTURE = 50

export const handleDesktopEventsWithGesture = (
  target: HTMLElement,
  {
    onGestureStart = () => {},
    onGestureChange = () => {},
    onGestureEnd = () => {},
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

  target.addEventListener(Params.eventScroll, (e: any) => {
    preventDefault(e)

    if (!isScrolling) {
      currentGestureX = getEventCoordX(e, 0)
      currentGestureY = getEventCoordY(e, 0)
      currentGestureS = 1
      onGestureStart(currentGestureX, currentGestureY, currentGestureS, 0)
      isScrolling = true
    }

    if (e.ctrlKey || e.metaKey) {
      currentGestureS = Math.max(0.1, currentGestureS - e.deltaY * 0.01)
    } else {
      currentGestureX -= e.deltaX
      currentGestureY -= e.deltaY
    }

    onGestureChange(currentGestureX, currentGestureY, currentGestureS, 0)
    debouncedStopScrolling()
  })
}
