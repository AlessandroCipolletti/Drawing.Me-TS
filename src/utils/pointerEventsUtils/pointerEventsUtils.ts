import Params from 'main/Params'
import { handleTouchEventsWithGestures, PointerGestureCallbacks } from './touchEventsUtils'
import { handleDesktopEventsWithGesture } from './desktopEventsUtils'
import { preventDefault } from 'utils/domUtils'

/**
 * High-rate 120 Hz pointer/touch dispatcher.
 * Fix #1 from the rewrite plan: Do NOT wrap stroke or gesture handlers in delayFn (requestAnimationFrame),
 * so iPad ProMotion 120 Hz samples paint synchronously without a 1-frame lag or dropped coalesced points.
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
