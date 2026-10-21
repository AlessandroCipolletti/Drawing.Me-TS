import Params from 'main/Params'
import { handleTouchEventsWithGestures, PointerGestureCallbacks } from './touchEventsUtils'
import { handleDesktopEventsWithGesture } from './desktopEventsUtils'
import { preventDefault } from 'utils/domUtils'

/**
 * Collects every new pencil sample. The editor paints those samples once per screen refresh.
 */
export const handlePointerEvents = (
  target: Element | Element[],
  {
    onSingleTouchStart = () => {},
    onSingleTouchMove = () => {},
    onSingleTouchEnd = () => {},
    onGestureStart = () => {},
    onGestureChange = () => {},
    onGestureEnd = () => {},
    onTwoFingersSingleTap = () => {},
    onThreeFingersSingleTap = () => {},
    onFourFingersSingleTap = () => {},
  }: PointerGestureCallbacks = {}
): (() => void) => {
  const targets = Array.isArray(target) ? target : [target]
  const cleanups: Array<() => void> = []
  targets.forEach((el) => {
    if (!(el instanceof Element)) {
      return
    }
    const cleanTouch = handleTouchEventsWithGestures(el as HTMLElement, {
      onSingleTouchStart,
      onSingleTouchMove,
      onSingleTouchEnd,
      onGestureStart,
      onGestureChange,
      onGestureEnd,
      onTwoFingersSingleTap,
      onThreeFingersSingleTap,
      onFourFingersSingleTap,
    })
    if (typeof cleanTouch === 'function') {
      cleanups.push(cleanTouch)
    }

    if (Params.isDesktop) {
      handleDesktopEventsWithGesture(el as HTMLElement, {
        onGestureStart,
        onGestureChange,
        onGestureEnd,
      })
    } else {
      el.addEventListener('gesturestart', preventDefault)
      el.addEventListener('gesturechange', preventDefault)
      el.addEventListener('gestureend', preventDefault)
    }
  })
  return () => {
    cleanups.forEach((fn) => fn())
  }
}
