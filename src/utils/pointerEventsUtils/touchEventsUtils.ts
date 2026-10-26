import Params from 'main/Params'
import {
  round,
  getAngleDegBetweenTwoPoints,
  getDistanceBetweenTwoPoints,
  getMiddlePointCoords,
} from 'utils/mathUtils'
import {
  preventDefault,
  getEventCoordX,
  getEventCoordY,
  filterTouchesByTargets,
  nodeIsPartOf,
} from 'utils/domUtils'
import { delay } from 'utils/jsUtils'
import { TOUCH_TYPE_STYLUS, TOUCH_TYPE_FINGER } from 'main/constants'

export interface PointerSampleStamp {
  timeStamp?: number
  clientX?: number
  clientY?: number
}

export interface DeliveredPointerSample {
  timeStamp: number
  clientX: number
  clientY: number
}

/** Drops samples already painted by pointerrawupdate or repeated inside one coalesced list. */
export const filterFreshPointerSamples = <T extends PointerSampleStamp>(
  samples: T[],
  last: DeliveredPointerSample | null
): { fresh: T[]; last: DeliveredPointerSample | null } => {
  let cursor = last
  const fresh: T[] = []
  for (const sample of samples) {
    const timeStamp = sample.timeStamp || 0
    const clientX = sample.clientX ?? 0
    const clientY = sample.clientY ?? 0
    if (cursor) {
      if (timeStamp && cursor.timeStamp && timeStamp <= cursor.timeStamp) continue
      if (clientX === cursor.clientX && clientY === cursor.clientY) continue
    }
    cursor = { timeStamp: timeStamp || cursor?.timeStamp || 0, clientX, clientY }
    fresh.push(sample)
  }
  return { fresh, last: cursor }
}

const TIME_TO_WAIT_FOR_SECOND_FINGER = 40
const TIME_TO_WAIT_FOR_TAP_END = 50
const MOVE_EVENTS_TO_FORCE_MOVE = 6

export interface PointerGestureCallbacks {
  onSingleTouchStart?: (e: any, touchEvent: any) => void
  onSingleTouchMove?: (e: any, touchEvent: any) => void
  onSingleTouchEnd?: (e: any) => void
  onGestureStart?: (x: number, y: number, s: number, r: number) => void
  onGestureChange?: (x: number, y: number, s: number, r: number) => void
  onGestureEnd?: (x: number, y: number, s: number, r: number) => void
  onTwoFingersSingleTap?: (e: any, touches: any[]) => void
  onThreeFingersSingleTap?: (e: any, touches: any[]) => void
  onFourFingersSingleTap?: (e: any, touches: any[]) => void
  isWheelBlocked?: () => boolean
}

const convertTiltToAltitudeAzimuth = (tiltX = 0, tiltY = 0): [number, number] => {
  if (tiltX === 0 && tiltY === 0) {
    return [Math.PI / 2, 0]
  }
  const radX = (tiltX * Math.PI) / 180
  const radY = (tiltY * Math.PI) / 180
  const tanX = Math.tan(radX)
  const tanY = Math.tan(radY)
  const altitudeAngle = Math.atan(1 / Math.sqrt(tanX * tanX + tanY * tanY))
  const azimuthAngle = (Math.atan2(tanY, tanX) + 2 * Math.PI) % (2 * Math.PI)
  return [altitudeAngle, azimuthAngle]
}

export const normalizeTouchOrPointerEvent = (ev: any) => {
  if (!ev) return ev
  const isStylus = ev.touchType === TOUCH_TYPE_STYLUS || ev.pointerType === 'pen'
  const touchType = isStylus ? TOUCH_TYPE_STYLUS : TOUCH_TYPE_FINGER

  const force =
    typeof ev.force === 'number' ? ev.force : typeof ev.pressure === 'number' ? ev.pressure : 0
  let altitudeAngle = ev.altitudeAngle
  let azimuthAngle = ev.azimuthAngle

  if (
    isStylus &&
    typeof altitudeAngle !== 'number' &&
    (typeof ev.tiltX === 'number' || typeof ev.tiltY === 'number')
  ) {
    ;[altitudeAngle, azimuthAngle] = convertTiltToAltitudeAzimuth(ev.tiltX || 0, ev.tiltY || 0)
  }

  const rawTwist = typeof ev.twist === 'number' ? ev.twist : 0
  const twist = ev.twistIsRadians ? rawTwist : (rawTwist * Math.PI) / 180
  const hasTwist = Boolean(ev.hasTwist || rawTwist !== 0)
  const tangentialPressure = typeof ev.tangentialPressure === 'number' ? ev.tangentialPressure : 0

  return {
    pointerId: ev.pointerId ?? ev.identifier ?? 0,
    identifier: ev.identifier ?? ev.pointerId ?? 0,
    clientX: ev.clientX,
    clientY: ev.clientY,
    pageX: ev.pageX ?? ev.clientX,
    pageY: ev.pageY ?? ev.clientY,
    target: ev.target,
    touchType,
    pointerType: ev.pointerType,
    shiftKey: Boolean(ev.shiftKey),
    force,
    tangentialPressure,
    altitudeAngle,
    azimuthAngle: azimuthAngle ?? 0,
    twist,
    hasTwist,
    twistIsRadians: true,
    timeStamp: ev.timeStamp ?? 0,
  }
}

export const handleTouchEventsWithGestures = (
  target: HTMLElement,
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
) => {
  const activePointers = new Map<number, any>()
  const lastDeliveredSampleByPointer = new Map<number, DeliveredPointerSample>()
  let touches: any[] = []
  let ratedTouchEvents: any[] = []
  let waitedForFingers = false
  let waitedForTapEnd = false
  let movedBeforeGesture = false
  let gestureStarted = false
  let gestureInterrupted = false
  let touchCanceled = false
  let usedForSingleTouch = false
  let maxTouchesLength = 0
  let initialRotation = 0
  let initialGesturePointsDistance = 0
  let touchMoveLength = 0
  let currentGestureX = 0
  let currentGestureY = 0
  let currentGestureS = 0
  let currentGestureR = 0
  let listenersAttached = false

  const supportsPointerEvents = typeof globalThis !== 'undefined' && 'PointerEvent' in globalThis
  const supportsRawUpdate =
    typeof globalThis !== 'undefined' && 'onpointerrawupdate' in globalThis && Params.ios

  const startEventName = supportsPointerEvents ? 'pointerdown' : Params.eventStart
  const moveEventName = supportsPointerEvents ? 'pointermove' : Params.eventMove
  const endEventName = supportsPointerEvents ? 'pointerup' : Params.eventEnd
  const cancelEventName = supportsPointerEvents ? 'pointercancel' : Params.eventCanceled

  const detachDocumentListeners = () => {
    if (!listenersAttached) return
    listenersAttached = false
    document.removeEventListener(moveEventName, handleTouchMove)
    if (supportsRawUpdate) {
      document.removeEventListener('pointerrawupdate', handleTouchMove)
    }
    document.removeEventListener(endEventName, handleTouchEnd)
    if (cancelEventName) {
      document.removeEventListener(cancelEventName, handleTouchCanceled)
    }
  }

  const attachDocumentListeners = () => {
    if (listenersAttached) return
    listenersAttached = true
    document.addEventListener(moveEventName, handleTouchMove)
    if (supportsRawUpdate) {
      document.addEventListener('pointerrawupdate', handleTouchMove)
    }
    document.addEventListener(endEventName, handleTouchEnd)
    if (cancelEventName) {
      document.addEventListener(cancelEventName, handleTouchCanceled)
    }
  }

  const reset = () => {
    activePointers.clear()
    lastDeliveredSampleByPointer.clear()
    touches = []
    ratedTouchEvents = []
    waitedForFingers = false
    waitedForTapEnd = false
    movedBeforeGesture = false
    gestureInterrupted = false
    gestureStarted = false
    usedForSingleTouch = false
    initialRotation = 0
    initialGesturePointsDistance = 0
    maxTouchesLength = 0
    touchMoveLength = 0
    currentGestureX = 0
    currentGestureY = 0
    currentGestureS = 0
    currentGestureR = 0
  }

  const syncTouchesFromEvent = (e: any, phase: 'start' | 'move' | 'end'): any | null => {
    if (e && Array.isArray(e.touches)) {
      const rawList =
        phase === 'start' ? filterTouchesByTargets(e, target) : filterTouchesByTargets(e, [])
      activePointers.clear()
      rawList.forEach((t: any, idx: number) => {
        const norm = normalizeTouchOrPointerEvent(t)
        activePointers.set(norm.pointerId ?? idx, norm)
      })
      touches = Array.from(activePointers.values())
      if (phase === 'end' && e.changedTouches?.length) {
        return normalizeTouchOrPointerEvent(e.changedTouches[e.changedTouches.length - 1])
      }
      return touches[touches.length - 1] || null
    }

    const pid = e?.pointerId ?? e?.identifier ?? 0
    const activeStylus = Array.from(activePointers.values()).find(
      (p) => p.touchType === TOUCH_TYPE_STYLUS
    )
    if (phase === 'start') {
      if (typeof e?.button === 'number' && e.button !== 0) {
        return null
      }
      if (e?.target && e.target !== target && !nodeIsPartOf(e.target, target)) {
        return null
      }
      const norm = normalizeTouchOrPointerEvent(e)
      if (activeStylus && norm.touchType !== TOUCH_TYPE_STYLUS) {
        return null
      }
      if (norm.touchType === TOUCH_TYPE_STYLUS && activePointers.size > 0 && !gestureStarted) {
        activePointers.clear()
        lastDeliveredSampleByPointer.clear()
        ratedTouchEvents = []
        maxTouchesLength = 1
      }
      activePointers.set(pid, norm)
      touches = Array.from(activePointers.values())
      return norm
    }

    if (phase === 'move') {
      const prev = activePointers.get(pid)
      if (!prev) {
        return null
      }
      const norm = normalizeTouchOrPointerEvent(e)
      if (prev.target) {
        norm.target = prev.target
      }
      activePointers.set(pid, norm)
      touches = Array.from(activePointers.values())
      return norm
    }

    // phase === 'end'
    const prev = activePointers.get(pid)
    if (!prev) {
      return null
    }
    const removed = normalizeTouchOrPointerEvent(e)
    if (prev?.target) {
      removed.target = prev.target
    }
    activePointers.delete(pid)
    lastDeliveredSampleByPointer.delete(pid)
    touches = Array.from(activePointers.values())
    return removed
  }

  const getCurrentGestureCoords = (): [number, number] => {
    const x1 = getEventCoordX(touches[0], 0)
    const y1 = getEventCoordY(touches[0], 0)
    const x2 = getEventCoordX(touches[1], 0)
    const y2 = getEventCoordY(touches[1], 0)
    return getMiddlePointCoords(x1, y1, x2, y2, 0)
  }

  const getCurrentGestureScale = (): number => {
    const x1 = getEventCoordX(touches[0], 0)
    const y1 = getEventCoordY(touches[0], 0)
    const x2 = getEventCoordX(touches[1], 0)
    const y2 = getEventCoordY(touches[1], 0)
    const currentGesturePointsDistance = getDistanceBetweenTwoPoints(x1, y1, x2, y2, 1)
    initialGesturePointsDistance = initialGesturePointsDistance || currentGesturePointsDistance
    return initialGesturePointsDistance
      ? round(currentGesturePointsDistance / initialGesturePointsDistance, 10) || 1
      : 1
  }

  const getCurrentGestureRotation = (): number => {
    const currentRotation = getAngleDegBetweenTwoPoints(
      touches[0].clientX,
      touches[0].clientY,
      touches[1].clientX,
      touches[1].clientY
    )
    initialRotation = initialRotation || currentRotation
    return initialRotation ? currentRotation - initialRotation : 0
  }

  const handleGestureChange = () => {
    if (
      maxTouchesLength === 2 &&
      touches.length === 2 &&
      (touchMoveLength > MOVE_EVENTS_TO_FORCE_MOVE || waitedForTapEnd) &&
      !movedBeforeGesture &&
      !gestureInterrupted &&
      !usedForSingleTouch
    ) {
      ;[currentGestureX, currentGestureY] = getCurrentGestureCoords()
      currentGestureS = getCurrentGestureScale()
      currentGestureR = getCurrentGestureRotation()
      if (gestureStarted) {
        onGestureChange(currentGestureX, currentGestureY, currentGestureS, currentGestureR)
      } else {
        gestureStarted = true
        onGestureStart(currentGestureX, currentGestureY, currentGestureS, currentGestureR)
      }
    }
  }

  const handleTouchStart = async (e: any) => {
    preventDefault(e)
    const isFirstTouch = touches.length === 0
    if (isFirstTouch) {
      touchCanceled = false
    }
    if (touchCanceled) {
      return
    }
    const sample = syncTouchesFromEvent(e, 'start')
    if (!sample || !touches.length) {
      return
    }
    maxTouchesLength = Math.max(maxTouchesLength, touches.length)

    // Apple Pencil stylus and Desktop mouse start immediately at 0ms latency without waiting for a second finger
    if (sample.touchType === TOUCH_TYPE_STYLUS || sample.pointerType === 'mouse') {
      attachDocumentListeners()
      if (usedForSingleTouch) {
        onSingleTouchEnd(sample)
      }
      waitedForFingers = true
      usedForSingleTouch = true
      ratedTouchEvents = []
      onSingleTouchStart(e, sample)
      return
    }

    if (isFirstTouch) {
      attachDocumentListeners()
      ratedTouchEvents.push(sample)

      await delay(TIME_TO_WAIT_FOR_SECOND_FINGER)
      if (!touches.length) {
        return
      }
      waitedForFingers = true
      if (maxTouchesLength === 1) {
        if (!usedForSingleTouch && ratedTouchEvents.length) {
          usedForSingleTouch = true
          onSingleTouchStart(e, ratedTouchEvents[0])
          for (let i = 1; i < ratedTouchEvents.length; i++) {
            onSingleTouchMove(e, ratedTouchEvents[i])
          }
          ratedTouchEvents = []
        }
      }
      if (touches.length > 0) {
        await delay(TIME_TO_WAIT_FOR_TAP_END)
        waitedForTapEnd = true
      }
    }
    if (touches.length > 1 && usedForSingleTouch) {
      onSingleTouchEnd(touches[0])
      touchCanceled = true
      reset()
    }
    if (touches.length > 2) {
      gestureInterrupted = true
    }
  }

  const handleTouchMove = (e: any) => {
    preventDefault(e)
    if (!touches.length || touchCanceled) {
      return
    }
    const latestSample = syncTouchesFromEvent(e, 'move')
    if (!latestSample || !touches.length) {
      return
    }

    const pid = latestSample.pointerId ?? 0

    if (maxTouchesLength !== 1) {
      touchMoveLength++
      if (touchMoveLength > MOVE_EVENTS_TO_FORCE_MOVE || waitedForTapEnd) {
        handleGestureChange()
      }
      return
    }

    if (maxTouchesLength === 1) {
      let coalescedSamples: any[]
      if (typeof e.getCoalescedEvents === 'function') {
        const rawList = e.getCoalescedEvents()
        const source = rawList && rawList.length > 0 ? rawList : [e]
        const normalized = source.map((ev: any) => {
          const norm = normalizeTouchOrPointerEvent(ev)
          if (!norm.target) {
            norm.target = latestSample.target || target
          }
          return norm
        })
        const filtered = filterFreshPointerSamples(
          normalized,
          lastDeliveredSampleByPointer.get(pid) ?? null
        )
        if (filtered.last) lastDeliveredSampleByPointer.set(pid, filtered.last)
        if (filtered.fresh.length === 0) return
        coalescedSamples = filtered.fresh
      } else {
        const filtered = filterFreshPointerSamples(
          [latestSample],
          lastDeliveredSampleByPointer.get(pid) ?? null
        )
        if (filtered.last) lastDeliveredSampleByPointer.set(pid, filtered.last)
        if (filtered.fresh.length === 0) return
        coalescedSamples = filtered.fresh
      }

      if (typeof e.getPredictedEvents === 'function' && coalescedSamples.length > 0) {
        const rawPredicted = e.getPredictedEvents()
        if (Array.isArray(rawPredicted) && rawPredicted.length > 0) {
          coalescedSamples[coalescedSamples.length - 1].predictedSamples = rawPredicted
            .slice(0, 3)
            .map((ev: any) => {
              const norm = normalizeTouchOrPointerEvent(ev)
              if (!norm.target) {
                norm.target = latestSample.target || target
              }
              return norm
            })
        }
      }

      touchMoveLength++

      if (!usedForSingleTouch) {
        ratedTouchEvents.push(...coalescedSamples)
      }
      if (touchMoveLength > MOVE_EVENTS_TO_FORCE_MOVE || waitedForFingers) {
        if (!usedForSingleTouch) {
          usedForSingleTouch = true
          onSingleTouchStart(e, ratedTouchEvents[0])
          for (let i = 1; i < ratedTouchEvents.length; i++) {
            onSingleTouchMove(e, ratedTouchEvents[i])
          }
          ratedTouchEvents = []
          movedBeforeGesture = true
        } else {
          movedBeforeGesture = true
          for (const sample of coalescedSamples) {
            onSingleTouchMove(e, sample)
          }
        }
      }
    }
  }

  const handleTouchEnd = (e: any) => {
    preventDefault(e)
    if (touchCanceled) {
      if (activePointers.size === 0) {
        detachDocumentListeners()
      }
      return
    }
    const lastSample = syncTouchesFromEvent(e, 'end')
    if (!lastSample && !Array.isArray(e?.touches)) {
      return
    }
    if (touches.length === 0) {
      detachDocumentListeners()
      if (usedForSingleTouch) {
        onSingleTouchEnd(lastSample || e)
      } else if (
        !usedForSingleTouch &&
        touchMoveLength <= MOVE_EVENTS_TO_FORCE_MOVE &&
        maxTouchesLength === 1
      ) {
        usedForSingleTouch = true
        onSingleTouchStart(e, ratedTouchEvents[0])
        onSingleTouchEnd(ratedTouchEvents[0])
      } else if (maxTouchesLength > 1) {
        if (gestureStarted) {
          onGestureEnd(currentGestureX, currentGestureY, currentGestureS, currentGestureR)
        } else if (!usedForSingleTouch && touchMoveLength < MOVE_EVENTS_TO_FORCE_MOVE) {
          if (maxTouchesLength === 2) {
            onTwoFingersSingleTap(e, touches)
          } else if (maxTouchesLength === 3) {
            onThreeFingersSingleTap(e, touches)
          } else if (maxTouchesLength === 4) {
            onFourFingersSingleTap(e, touches)
          }
        }
      }
      reset()
    } else if (gestureStarted && touches.length !== 2) {
      gestureInterrupted = true
    }
  }

  const handleTouchCanceled = (e: any) => {
    preventDefault(e)
    touchCanceled = true
    if (maxTouchesLength === 2 && gestureStarted) {
      onGestureEnd(currentGestureX, currentGestureY, currentGestureS, currentGestureR)
    }
    reset()
    detachDocumentListeners()
  }

  if (target.style) {
    target.style.touchAction = 'none'
  }
  target.addEventListener(startEventName, handleTouchStart)
  if (supportsPointerEvents && Params.supportTouch) {
    target.addEventListener('touchstart', preventDefault, { passive: false })
  }

  return () => {
    reset()
    detachDocumentListeners()
    target.removeEventListener(startEventName, handleTouchStart)
    if (supportsPointerEvents && Params.supportTouch) {
      target.removeEventListener('touchstart', preventDefault)
    }
  }
}
