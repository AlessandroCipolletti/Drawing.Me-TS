import Params from 'main/Params'
import {
  getEventCoordX,
  getEventCoordY,
  preventDefault,
  redrawDomElement,
  getDomRect,
} from 'utils/domUtils'
import {
  fadeInElements,
  fadeOutElements,
  cancelElementAnimationIfExists,
  animateElement,
} from 'utils/animationsUtils'
import {
  getDistanceBetweenTwoPoints,
  round,
  getMiddlePointCoords,
  convertAngleDegToRad,
  getPointProjectionOnLine,
  getAngleDegBetweenTwoPoints,
} from 'utils/mathUtils'
import { debounceThrottle, callCallbackIfDataChanged, isEqual } from 'utils/jsUtils'

let divPreventEvents: HTMLDivElement | null = null
const getDivPreventEvents = (): HTMLDivElement => {
  if (!divPreventEvents) {
    divPreventEvents = document.createElement('div')
    divPreventEvents.classList.add('drawith__overlay-dragNdrop')
  }
  return divPreventEvents
}

export const addHorizontalDragSliderHandler = (
  element: HTMLElement,
  container: HTMLElement,
  onChange: (value: any, isMoving: boolean, dragged: boolean) => void,
  valueMax: number,
  valueMin: number,
  returnRelativeDiff = false,
  decimals = 4,
  waitingTime = 0
) => {
  let dragEnabled = true
  let lastValue: any = false
  let dragged = false
  let valueAtTouchStart = 0
  let coordAtTouchStart = 0
  let containerLeft = 0
  let containerWidth = 0
  const deltaValue = valueMax - valueMin

  const enable = () => (dragEnabled = true)
  const getValueFromCoord = (coord: number) =>
    round((coord * deltaValue) / containerWidth + valueMin, decimals)

  const update = (newValue: number) => {
    dragEnabled = waitingTime === 0
    if (newValue !== lastValue) {
      lastValue = newValue
      onChange(newValue, true, dragged)
    }
    if (dragEnabled === false) {
      setTimeout(enable, waitingTime)
    }
  }
  const onTouchStart = (e: Event) => {
    preventDefault(e)
    dragged = false
    document.addEventListener(Params.eventMove, onTouchMove)
    document.addEventListener(Params.eventEnd, onTouchEnd)
    const containerRect = container.getBoundingClientRect()
    containerLeft = round(containerRect.left, 0)
    containerWidth = round(containerRect.width, 0)
    if (returnRelativeDiff) {
      coordAtTouchStart = getEventCoordX(e)
      valueAtTouchStart = getValueFromCoord(getDomRect(element).centerX - containerLeft)
    } else {
      valueAtTouchStart = coordAtTouchStart = 0
    }
    _touchMove(getEventCoordX(e))
  }
  const _touchMove = (coordX: number) => {
    let newValue: number
    if (returnRelativeDiff) {
      newValue = getValueFromCoord(coordX - coordAtTouchStart)
      newValue = Math.max(newValue, valueMin - valueAtTouchStart)
      newValue = Math.min(newValue, valueMax - valueAtTouchStart)
    } else {
      newValue = getValueFromCoord(coordX - containerLeft)
      newValue = Math.max(newValue, valueMin)
      newValue = Math.min(newValue, valueMax)
    }
    update(newValue)
  }
  const onTouchMove = (e: Event) => {
    preventDefault(e)
    if (dragEnabled) {
      _touchMove(getEventCoordX(e))
      dragged = true
    }
  }
  const onTouchEnd = () => {
    onChange(lastValue, false, dragged)
    document.removeEventListener(Params.eventMove, onTouchMove)
    document.removeEventListener(Params.eventEnd, onTouchEnd)
  }

  element.addEventListener(Params.eventStart, onTouchStart)
  container.addEventListener(Params.eventStart, onTouchStart)
}

export const addVerticalDragSliderHandler = (
  element: HTMLElement,
  container: HTMLElement,
  onChange: (value: any, isMoving: boolean, dragged: boolean) => void,
  valueMax: number,
  valueMin: number,
  returnRelativeDiff = false,
  decimals = 4,
  waitingTime = 0
) => {
  let dragEnabled = true
  let lastValue: any = false
  let dragged = false
  let valueAtTouchStart = 0
  let coordAtTouchStart = 0
  let containerTop = 0
  let containerHeight = 0
  const deltaValue = valueMax - valueMin

  const enable = () => (dragEnabled = true)
  const getValueFromCoord = (coord: number) =>
    round(valueMax - (coord * deltaValue) / containerHeight + valueMin, decimals)

  const update = (newValue: number) => {
    dragEnabled = waitingTime === 0
    if (newValue !== lastValue) {
      lastValue = newValue
      onChange(newValue, true, dragged)
    }
    if (dragEnabled === false) {
      setTimeout(enable, waitingTime)
    }
  }
  const onTouchStart = (e: Event) => {
    preventDefault(e)
    dragged = false
    document.addEventListener(Params.eventMove, onTouchMove)
    document.addEventListener(Params.eventEnd, onTouchEnd)
    const containerRect = container.getBoundingClientRect()
    containerTop = round(containerRect.top, 0)
    containerHeight = round(containerRect.height, 0)
    if (returnRelativeDiff) {
      coordAtTouchStart = getEventCoordY(e)
      valueAtTouchStart = getValueFromCoord(getEventCoordY(e) - containerTop)
    } else {
      valueAtTouchStart = coordAtTouchStart = 0
    }
    _touchMove(getEventCoordY(e))
  }
  const _touchMove = (coordY: number) => {
    let newValue: number
    if (returnRelativeDiff) {
      newValue = getValueFromCoord(coordY - coordAtTouchStart)
      newValue = Math.max(newValue, valueMin - valueAtTouchStart)
      newValue = Math.min(newValue, valueMax - valueAtTouchStart)
    } else {
      newValue = getValueFromCoord(coordY - containerTop)
      newValue = Math.max(newValue, valueMin)
      newValue = Math.min(newValue, valueMax)
    }
    update(newValue)
  }
  const onTouchMove = (e: Event) => {
    preventDefault(e)
    if (dragEnabled) {
      _touchMove(getEventCoordY(e))
      dragged = true
    }
  }
  const onTouchEnd = () => {
    onChange(lastValue, false, dragged)
    document.removeEventListener(Params.eventMove, onTouchMove)
    document.removeEventListener(Params.eventEnd, onTouchEnd)
  }

  element.addEventListener(Params.eventStart, onTouchStart)
  container.addEventListener(Params.eventStart, onTouchStart)
}

const LONG_PRESS_DURATION = 300

export interface ListScrollClickPressOptions {
  shouldScrollOnDrag?: (ctx: {
    startTarget: EventTarget | null
    touchStartX: number
    touchStartY: number
  }) => boolean
}

export const addListScrollClickAndPressHandlers = (
  listElement: HTMLElement,
  onClick: (e: any) => void,
  onLongPress: (e: any) => void,
  minPxToScrollBase = 20,
  options?: ListScrollClickPressOptions
) => {
  let touchStartX = -1
  let touchStartY = -1
  let initialScrollTop = 0
  let initialScrollLeft = 0
  let contentMaxScrollY = -1
  let contentMaxScrollX = -1
  let longPressTimeout: any = false
  let isLongPressed = false
  let isBugged = false
  let startedFromTop = false
  let minPxToScroll = 0
  let startTarget: EventTarget | null = null

  const doLongPress = (e: any) => {
    isLongPressed = true
    clearTimeout(longPressTimeout)
    onEventEnd()
    onLongPress(e)
  }

  const onEventEnd = () => {
    touchStartX = touchStartY = -1
    startTarget = null
    isBugged = isLongPressed = startedFromTop = false
    listElement.removeEventListener('scroll', fixDragIosBug)
    document.removeEventListener(Params.eventMove, onTouchMove)
    document.removeEventListener(Params.eventEnd, onTouchEnd)
    if (Params.eventCanceled) {
      document.removeEventListener(Params.eventCanceled, onEventEnd)
    }
    clearTimeout(longPressTimeout)
  }

  const fixScrollIosBug = () => {
    startedFromTop = listElement.scrollTop === 0
    if (listElement.scrollTop === 0) {
      listElement.scrollTop = 1
    } else if (listElement.scrollTop === contentMaxScrollY) {
      listElement.scrollTop = contentMaxScrollY - 1
    }
    if (listElement.scrollLeft === 0) {
      listElement.scrollLeft = 1
    } else if (listElement.scrollLeft === contentMaxScrollX) {
      listElement.scrollLeft = contentMaxScrollX - 1
    }
  }
  const fixDragIosBug = (e: Event) => {
    e.stopPropagation()
    if (isLongPressed) {
      preventDefault(e)
    }
  }

  const onTouchStart = async (e: any) => {
    e.stopPropagation()
    if ((typeof e.button === 'number' && e.button > 0) || (e.touches && e.touches.length > 1)) {
      e.preventDefault()
      return
    }
    isLongPressed = false
    minPxToScroll = minPxToScrollBase * (Params.isDesktop ? 1 : Params.pxScale)

    startTarget = e.target
    touchStartX = getEventCoordX(e, 0)
    touchStartY = getEventCoordY(e, 0)
    longPressTimeout = setTimeout(() => {
      preventDefault(e)
      doLongPress(e)
    }, LONG_PRESS_DURATION)

    contentMaxScrollY = Math.max(0, listElement.scrollHeight - listElement.clientHeight)
    contentMaxScrollX = Math.max(0, listElement.scrollWidth - listElement.clientWidth)
    if (contentMaxScrollY === 0 && contentMaxScrollX === 0) {
      preventDefault(e)
    } else if (!Params.isDesktop) {
      fixScrollIosBug()
    }
    initialScrollTop = listElement.scrollTop
    initialScrollLeft = listElement.scrollLeft

    listElement.addEventListener('scroll', fixDragIosBug)
    document.addEventListener(Params.eventMove, onTouchMove)
    document.addEventListener(Params.eventEnd, onTouchEnd)
    if (Params.eventCanceled) {
      document.addEventListener(Params.eventCanceled, onEventEnd)
    }
  }

  const onTouchMove = (e: any) => {
    if (isLongPressed) {
      e.preventDefault()
    }
    e.stopPropagation()
    const touchMoveX = getEventCoordX(e, 0)
    const touchMoveY = getEventCoordY(e, 0)
    const touchDistance = getDistanceBetweenTwoPoints(
      touchStartX,
      touchStartY,
      touchMoveX,
      touchMoveY
    )

    if (!Params.isDesktop && (isBugged || (startedFromTop && touchMoveY > touchStartY))) {
      isBugged = true
      preventDefault(e)
    }
    if (Math.abs(touchDistance) > minPxToScroll || (e.touches && e.touches.length > 1)) {
      clearTimeout(longPressTimeout)
      if (!isLongPressed && e.pointerType === 'mouse') {
        const allowScroll =
          options?.shouldScrollOnDrag?.({
            startTarget,
            touchStartX,
            touchStartY,
          }) ?? true
        if (allowScroll) {
          if (contentMaxScrollY > 0) {
            listElement.scrollTop = initialScrollTop - (touchMoveY - touchStartY)
          }
          if (contentMaxScrollX > 0) {
            listElement.scrollLeft = initialScrollLeft - (touchMoveX - touchStartX)
          }
        }
      }
    }
  }

  const onTouchEnd = (e: any) => {
    preventDefault(e)
    if (!isLongPressed && (!e.touches || e.touches.length === 0)) {
      const touchEndX = getEventCoordX(e, 0)
      const touchEndY = getEventCoordY(e, 0)
      const touchDistance = getDistanceBetweenTwoPoints(
        touchStartX,
        touchStartY,
        touchEndX,
        touchEndY
      )
      if (Math.abs(touchDistance) < minPxToScroll) {
        if (startTarget && e.target !== startTarget) {
          onClick({ ...e, target: startTarget })
        } else {
          onClick(e)
        }
      }
    }
    onEventEnd()
  }

  listElement.addEventListener(Params.eventStart, onTouchStart)
}

export const addListHorizontalScrollClickAndPressHandlers = (
  listElement: HTMLElement,
  onClick: (e: any) => void,
  onLongPress: (e: any) => void,
  minPxToScrollBase = 20
) => {
  let touchStartX = -1
  let touchStartY = -1
  let initialScrollLeft = 0
  let contentMaxScrollX = -1
  let longPressTimeout: any = false
  let isLongPressed = false
  let minPxToScroll = 0
  let startTarget: EventTarget | null = null
  let lastTapStart = 0

  const doLongPress = (e: any) => {
    isLongPressed = true
    clearTimeout(longPressTimeout)
    onEventEnd()
    onLongPress(e)
  }

  const onEventEnd = () => {
    touchStartX = touchStartY = -1
    startTarget = null
    isLongPressed = false
    listElement.removeEventListener('scroll', fixDragIosBug)
    document.removeEventListener(Params.eventMove, onTouchMove)
    document.removeEventListener(Params.eventEnd, onTouchEnd)
    if (Params.eventCanceled) {
      document.removeEventListener(Params.eventCanceled, onEventEnd)
    }
    clearTimeout(longPressTimeout)
  }

  const fixScrollIosBug = () => {
    if (listElement.scrollLeft === 0) {
      listElement.scrollLeft = 1
    } else if (listElement.scrollLeft === contentMaxScrollX) {
      listElement.scrollLeft = contentMaxScrollX - 1
    }
  }
  const fixDragIosBug = (e: Event) => {
    e.stopPropagation()
    if (isLongPressed) {
      preventDefault(e)
    }
  }

  const onTouchStart = async (e: any) => {
    const now = Date.now()
    const isDoubleTap = now - lastTapStart < 300
    lastTapStart = now
    if (isDoubleTap) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    e.stopPropagation()
    if ((typeof e.button === 'number' && e.button > 0) || (e.touches && e.touches.length > 1)) {
      e.preventDefault()
      return
    }
    isLongPressed = false
    minPxToScroll = minPxToScrollBase * (Params.isDesktop ? 1 : Params.pxScale)

    startTarget = e.target
    touchStartX = getEventCoordX(e, 0)
    touchStartY = getEventCoordY(e, 0)
    longPressTimeout = setTimeout(() => {
      preventDefault(e)
      doLongPress(e)
    }, LONG_PRESS_DURATION)

    contentMaxScrollX = Math.max(0, listElement.scrollWidth - listElement.clientWidth)
    if (contentMaxScrollX === 0) {
      preventDefault(e)
    } else if (!Params.isDesktop) {
      fixScrollIosBug()
    }
    initialScrollLeft = listElement.scrollLeft

    listElement.addEventListener('scroll', fixDragIosBug)
    document.addEventListener(Params.eventMove, onTouchMove)
    document.addEventListener(Params.eventEnd, onTouchEnd)
    if (Params.eventCanceled) {
      document.addEventListener(Params.eventCanceled, onEventEnd)
    }
  }

  const onTouchMove = (e: any) => {
    if (isLongPressed) {
      e.preventDefault()
    }
    e.stopPropagation()
    const touchMoveX = getEventCoordX(e, 0)
    const touchMoveY = getEventCoordY(e, 0)
    const touchDistance = getDistanceBetweenTwoPoints(
      touchStartX,
      touchStartY,
      touchMoveX,
      touchMoveY
    )

    if (Math.abs(touchDistance) > minPxToScroll || (e.touches && e.touches.length > 1)) {
      clearTimeout(longPressTimeout)
      if (!isLongPressed && e.pointerType === 'mouse' && contentMaxScrollX > 0) {
        listElement.scrollLeft = initialScrollLeft - (touchMoveX - touchStartX)
      }
    }
  }

  const onTouchEnd = (e: any) => {
    preventDefault(e)
    if (!isLongPressed && (!e.touches || e.touches.length === 0)) {
      const touchEndX = getEventCoordX(e, 0)
      const touchEndY = getEventCoordY(e, 0)
      const touchDistance = getDistanceBetweenTwoPoints(
        touchStartX,
        touchStartY,
        touchEndX,
        touchEndY
      )
      if (Math.abs(touchDistance) < minPxToScroll) {
        if (startTarget && e.target !== startTarget) {
          onClick({ ...e, target: startTarget })
        } else {
          onClick(e)
        }
      }
    }
    onEventEnd()
  }

  const onWheel = (e: WheelEvent) => {
    const maxScrollX = listElement.scrollWidth - listElement.clientWidth
    if (maxScrollX > 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault()
      listElement.scrollLeft += e.deltaY
    }
  }

  listElement.addEventListener(Params.eventStart, onTouchStart, { passive: false })
  listElement.addEventListener('wheel', onWheel, { passive: false })

  return {
    cancelPendingLongPress: () => {
      clearTimeout(longPressTimeout)
      longPressTimeout = false
    },
  }
}

const MARGE_TO_START_SCROLLING = 100
const DELTA_SCROLL = 25
export const handleElementsListDragAndDrop = (() => {
  let moveEventX = 0
  let moveEventY = 0
  let listMaxScrollTop = 0
  let listMaxScrollLeft = 0
  let finalNewIndex: any = false
  let animationScale = 1
  let scrollIntervall: any = false
  let listHasVerticalScroll = false
  let listHasHorizontalScroll = false
  let directionVertical = false
  let needToFix = true
  let element: any = null
  let draggedElement: any = null
  let listRect: any = null
  let listElementsRects: any = null
  let list: any = null
  let onChange: any = null
  const preventDefaultSimple = (e: Event) => e.preventDefault()

  const getListElementsRects = (listEl: HTMLElement) => {
    listElementsRects = Array.from(listEl.children).map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      }
    })
    if (directionVertical) {
      listElementsRects.sort((a: any, b: any) => (a.top > b.top ? +1 : -1))
      updateVerticalDrop()
    } else {
      listElementsRects.sort((a: any, b: any) => (a.left > b.left ? +1 : -1))
      updateHorizontalDrop()
    }
  }

  const updateElementsRects = (deltaX: number, deltaY: number) => {
    listElementsRects.forEach((rect: any) => {
      rect.top += deltaY
      rect.bottom += deltaY
      rect.left += deltaX
      rect.right += deltaX
    })
  }

  const copyElementCanvases = (source: HTMLElement, clone: HTMLElement) => {
    const sources = source.querySelectorAll('canvas')
    const clones = clone.querySelectorAll('canvas')
    sources.forEach((oldCanvas, index) => {
      const newCanvas = clones[index] as HTMLCanvasElement | undefined
      if (!(oldCanvas instanceof HTMLCanvasElement) || !newCanvas) return
      newCanvas.width = oldCanvas.width
      newCanvas.height = oldCanvas.height
      newCanvas.getContext('2d')?.drawImage(oldCanvas, 0, 0)
    })
  }

  const buildDraggedElement = (selectedElement: HTMLElement, previewElements?: HTMLElement[]) => {
    const sources =
      previewElements && previewElements.length > 1 ? previewElements : [selectedElement]
    if (sources.length === 1) {
      const source = sources[0]
      const clone = source.cloneNode(true) as HTMLElement
      const rect = source.getBoundingClientRect()
      clone.style.width = `${rect.width}px`
      clone.style.height = `${rect.height}px`
      copyElementCanvases(source, clone)
      return clone
    }
    const wrap = document.createElement('div')
    wrap.classList.add('editor-layers__drag-group')
    let width = 0
    sources.forEach((source) => {
      const clone = source.cloneNode(true) as HTMLElement
      const rect = source.getBoundingClientRect()
      clone.style.width = `${rect.width}px`
      clone.style.height = `${rect.height}px`
      copyElementCanvases(source, clone)
      width = Math.max(width, rect.width)
      wrap.appendChild(clone)
    })
    wrap.style.width = `${width}px`
    return wrap
  }

  const initDragAndDropDom = (
    selectedElement: HTMLElement,
    startEventX: number,
    startEventY: number,
    previewElements?: HTMLElement[]
  ) => {
    animationScale = Params.isPhone ? 1.7 : 1.2
    const draggedEl = buildDraggedElement(selectedElement, previewElements)
    draggedEl.classList.add('displayNone', 'drawith__dragNdrop-element-dragging')
    moveEventX = startEventX
    moveEventY = startEventY
    draggedEl.style.cssText = `
      ${draggedEl.style.cssText}
      top: ${startEventY}px;
      left: ${startEventX}px;
      transform: translate3d(-50%, -50%, 0px) scale(${animationScale}) rotate(0deg);
    `
    Params.pagesContainer?.appendChild(draggedEl)
    fadeInElements(draggedEl, {
      duration: 200,
      maxFadeIn: 0.7,
    })

    animateElement(
      draggedEl,
      'bouncing',
      [
        {
          transform: `translate3d(-50%, -50%, 0px) scale(${animationScale}) rotate(+5deg)`,
          offset: 0,
        },
        {
          transform: `translate3d(-50%, -50%, 0px) scale(${animationScale}) rotate(-5deg)`,
          offset: 1,
        },
      ],
      300,
      {
        iterations: Infinity,
        direction: 'alternate',
        easing: 'ease-in-out',
      }
    )

    if (!Params.isDesktop) {
      const overlay = getDivPreventEvents()
      Params.pagesContainer?.appendChild(overlay)
      overlay.addEventListener(Params.eventStart, preventDefault)
    }

    return draggedEl
  }

  const removeDragAndDropDom = async (draggedEl: any) => {
    if (!Params.isDesktop) {
      const overlay = getDivPreventEvents()
      overlay.remove()
      overlay.removeEventListener(Params.eventStart, preventDefault)
    }
    cancelElementAnimationIfExists(draggedEl, 'bouncing')

    animateElement(
      draggedEl,
      'drop',
      [
        {
          top: `${moveEventY}px`,
          left: `${moveEventX}px`,
          transform: `translate3d(-50%, -50%, 0px) scale(${animationScale})`,
          offset: 0,
        },
        {
          top: `${(listElementsRects[finalNewIndex].top + listElementsRects[finalNewIndex].bottom) / 2}px`,
          left: `${(listElementsRects[finalNewIndex].left + listElementsRects[finalNewIndex].right) / 2}px`,
          transform: 'translate3d(-50%, -50%, 0px) scale(1)',
          offset: 1,
        },
      ],
      300,
      {
        easing: 'ease-in-out',
      }
    )

    await fadeOutElements(draggedEl, {
      duration: 300,
      maxFadeIn: 0.7,
    })
    cancelElementAnimationIfExists(draggedEl, 'drop')
    draggedEl.remove()
    draggedEl.querySelectorAll('canvas').forEach((canvas: HTMLCanvasElement) => {
      canvas.width = 0
    })
  }

  const updateVerticalDrop = debounceThrottle(() => {
    if (listElementsRects?.length) {
      let currentIndex = 0
      let res: number | false = false
      if (moveEventY < listElementsRects[0].top) {
        res = 0
      } else if (moveEventY > listElementsRects[listElementsRects.length - 1].bottom) {
        res = listElementsRects.length - 1
      } else {
        while (res === false && currentIndex < listElementsRects.length) {
          if (
            moveEventY < listElementsRects[currentIndex].bottom &&
            moveEventY > listElementsRects[currentIndex].top
          ) {
            res = currentIndex
          }
          currentIndex++
        }
      }
      if (res !== false) {
        finalNewIndex = res
        onChange(element, finalNewIndex, true)
      }
    }
  }, 150)

  const updateHorizontalDrop = debounceThrottle(() => {
    if (listElementsRects?.length) {
      let currentIndex = 0
      let res: number | false = false
      if (moveEventX < listElementsRects[0].left) {
        res = 0
      } else if (moveEventX > listElementsRects[listElementsRects.length - 1].right) {
        res = listElementsRects.length - 1
      } else {
        while (res === false && currentIndex < listElementsRects.length) {
          if (
            moveEventX < listElementsRects[currentIndex].right &&
            moveEventX > listElementsRects[currentIndex].left
          ) {
            res = currentIndex
          }
          currentIndex++
        }
      }
      if (res !== false) {
        finalNewIndex = res
        onChange(element, finalNewIndex, true)
      }
    }
  }, 150)

  const fixListDimension = () => {
    if (needToFix) {
      redrawDomElement(list)
      needToFix = false
    }
  }

  const scrollListUp = () => {
    fixListDimension()
    if (list.scrollTop === 0 || moveEventY > listRect.top + MARGE_TO_START_SCROLLING) {
      clearInterval(scrollIntervall)
      scrollIntervall = false
    } else {
      const delta = round(Math.min(DELTA_SCROLL, list.scrollTop), 0)
      list.scrollTop = round(list.scrollTop - delta, 0)
      updateElementsRects(0, delta)
      updateVerticalDrop()
    }
  }

  const scrollListDown = () => {
    fixListDimension()
    if (
      list.scrollTop === listMaxScrollTop ||
      moveEventY < listRect.bottom - MARGE_TO_START_SCROLLING
    ) {
      clearInterval(scrollIntervall)
      scrollIntervall = false
    } else {
      const delta = round(Math.min(DELTA_SCROLL, listMaxScrollTop - list.scrollTop), 0)
      list.scrollTop = round(list.scrollTop + delta, 0)
      updateElementsRects(0, -delta)
      updateVerticalDrop()
    }
  }

  const scrollListLeft = () => {
    fixListDimension()
    if (list.scrollLeft === 0 || moveEventX > listRect.left + MARGE_TO_START_SCROLLING) {
      clearInterval(scrollIntervall)
      scrollIntervall = false
    } else {
      const delta = round(Math.min(DELTA_SCROLL, list.scrollLeft), 0)
      list.scrollLeft = round(list.scrollLeft - delta, 0)
      updateElementsRects(delta, 0)
      updateHorizontalDrop()
    }
  }

  const scrollListRight = () => {
    fixListDimension()
    if (
      list.scrollLeft === listMaxScrollLeft ||
      moveEventX < listRect.right - MARGE_TO_START_SCROLLING
    ) {
      clearInterval(scrollIntervall)
      scrollIntervall = false
    } else {
      const delta = round(Math.min(DELTA_SCROLL, listMaxScrollLeft - list.scrollLeft), 0)
      list.scrollLeft = round(list.scrollLeft + delta, 0)
      updateElementsRects(-delta, 0)
      updateHorizontalDrop()
    }
  }

  const onDragMove = (e: Event) => {
    preventDefault(e)
    if (e.target !== getDivPreventEvents()) {
      moveEventX = getEventCoordX(e)
      moveEventY = getEventCoordY(e)
      draggedElement.style.left = `${moveEventX}px`
      draggedElement.style.top = `${moveEventY}px`

      if (directionVertical) {
        if (!scrollIntervall) {
          updateVerticalDrop()
          if (listHasVerticalScroll) {
            if (list.scrollTop > 0 && moveEventY < listRect.top + MARGE_TO_START_SCROLLING) {
              scrollIntervall = setInterval(scrollListUp, 20)
            } else if (
              list.scrollTop < listMaxScrollTop &&
              moveEventY > listRect.bottom - MARGE_TO_START_SCROLLING
            ) {
              scrollIntervall = setInterval(scrollListDown, 20)
            }
          }
        }
      } else {
        if (!scrollIntervall) {
          updateHorizontalDrop()
          if (listHasHorizontalScroll) {
            if (list.scrollLeft > 0 && moveEventX < listRect.left + MARGE_TO_START_SCROLLING) {
              scrollIntervall = setInterval(scrollListLeft, 20)
            } else if (
              list.scrollLeft < listMaxScrollLeft &&
              moveEventX > listRect.right - MARGE_TO_START_SCROLLING
            ) {
              scrollIntervall = setInterval(scrollListRight, 20)
            }
          }
        }
      }
    }
  }

  const onDragEnd = async (e: Event) => {
    preventDefault(e)
    if (e.target !== getDivPreventEvents()) {
      clearInterval(scrollIntervall)
      removeDragAndDropDom(draggedElement)
      scrollIntervall = false
      onChange(element, finalNewIndex, false)
      document.removeEventListener(Params.eventMove, onDragMove)
      document.removeEventListener(Params.eventEnd, onDragEnd)
      element.removeEventListener(Params.eventMove, preventDefaultSimple)
      list.style.overflow = ''
      element = listElementsRects = onChange = listRect = list = null
    }
  }

  return (
    e: Event,
    listElement: HTMLElement,
    selectedElement: HTMLElement,
    saveDrag: (...args: any[]) => void,
    direction = 'vertical',
    previewElements?: HTMLElement[]
  ) => {
    preventDefault(e)
    list = listElement
    element = selectedElement
    directionVertical = direction === 'vertical'
    listRect = list.getBoundingClientRect()
    draggedElement = initDragAndDropDom(
      selectedElement,
      getEventCoordX(e),
      getEventCoordY(e),
      previewElements
    )
    listHasVerticalScroll = list.scrollHeight > list.clientHeight
    listHasHorizontalScroll = list.scrollWidth > list.clientWidth
    listMaxScrollTop = list.scrollHeight - list.clientHeight
    listMaxScrollLeft = list.scrollWidth - list.clientWidth

    onChange = callCallbackIfDataChanged(saveDrag)
    needToFix = true
    getListElementsRects(list)

    list.style.overflow = 'hidden'
    element.addEventListener(Params.eventMove, preventDefaultSimple)
    document.addEventListener(Params.eventMove, onDragMove)
    document.addEventListener(Params.eventEnd, onDragEnd)
  }
})()

const DEFAULT_MOVE_WAITING_TIME = 0
const LAYER_CONTENT_MIN_SIZE = 50
export const addResizeBulletsHandlers = (
  TL: HTMLElement,
  TR: HTMLElement,
  BR: HTMLElement,
  BL: HTMLElement,
  T: HTMLElement,
  R: HTMLElement,
  B: HTMLElement,
  L: HTMLElement,
  RT: HTMLElement,
  getCurrentState: () => any,
  getDotCoords: (dot: HTMLElement) => [number, number],
  getTouchCoords: (e: any) => [number, number],
  onStart: () => void,
  onChange: (
    state: any,
    left: boolean,
    top: boolean,
    right: boolean,
    bottom: boolean,
    rotation: boolean
  ) => void,
  onEnd: (state: any) => void,
  waitingTime = DEFAULT_MOVE_WAITING_TIME,
  getTransformKind?: () => string
) => {
  const cornerKeepsAspectRatio = () => !getTransformKind || getTransformKind() === 'resize'
  const isAffineHandleMode = () => !getTransformKind || getTransformKind() === 'resize'
  let dragEnabled = true
  let initialState: any
  let lastState: any
  let initialRotation: any
  let onTouchMove: any
  let startDotX: any
  let startDotY: any
  let oppositeX: any
  let oppositeY: any
  let touchStartX: any
  let touchStartY: any
  let contentCenterX: any
  let contentCenterY: any
  let resizeAngleCosFraction: any
  let resizeAngleSinFraction: any

  const handleResizeStart = (
    e: Event,
    point: HTMLElement,
    oppositePoint: HTMLElement,
    selectedResize: any
  ) => {
    if (!isAffineHandleMode()) return
    preventDefault(e)
    onStart()
    initialState = getCurrentState()
    const [touchX, touchY] = getTouchCoords(e)
    const initRadians = convertAngleDegToRad(initialState.r)
    resizeAngleCosFraction = Math.cos(initRadians)
    resizeAngleSinFraction = Math.sin(initRadians)
    ;[startDotX, startDotY] = getDotCoords(point)
    ;[oppositeX, oppositeY] = getDotCoords(oppositePoint)
    ;[touchStartX, touchStartY] = getPointProjectionOnLine(
      startDotX,
      startDotY,
      oppositeX,
      oppositeY,
      touchX,
      touchY
    )
    if (touchStartX === false || touchStartY === false) {
      touchStartX = touchX
      touchStartY = touchY
    }
    onTouchMove = selectedResize
    document.addEventListener(Params.eventMove, onTouchMove)
    document.addEventListener(Params.eventEnd, onTouchEnd)
  }
  const handleResizeChange = (
    left: boolean,
    top: boolean,
    xResize: boolean,
    yResize: boolean,
    ratioResize: boolean,
    e: Event
  ) => {
    preventDefault(e)
    if (!dragEnabled) {
      return
    }
    let [touchX, touchY]: [number | false, number | false] = getTouchCoords(e)

    if (ratioResize) {
      ;[touchX, touchY] = getPointProjectionOnLine(
        startDotX,
        startDotY,
        oppositeX,
        oppositeY,
        touchX,
        touchY
      )
      if (touchX === false || touchY === false) {
        return
      }
    }

    const wDiff = touchX - touchStartX
    const hDiff = touchY - touchStartY
    const rotatedWDiff = resizeAngleCosFraction * wDiff + resizeAngleSinFraction * hDiff
    const rotatedHDiff = resizeAngleCosFraction * hDiff - resizeAngleSinFraction * wDiff
    let newW = initialState.w
    let newH = initialState.h
    let newX = initialState.x
    let newY = initialState.y

    if (xResize) {
      if (left) {
        newW = initialState.w - rotatedWDiff
      } else {
        newW = initialState.w + rotatedWDiff
      }
      newX += 0.5 * rotatedWDiff * resizeAngleCosFraction
      newY += 0.5 * rotatedWDiff * resizeAngleSinFraction
    }

    if (yResize) {
      if (top) {
        newH = initialState.h - rotatedHDiff
      } else {
        newH = initialState.h + rotatedHDiff
      }
      newX -= 0.5 * rotatedHDiff * resizeAngleSinFraction
      newY += 0.5 * rotatedHDiff * resizeAngleCosFraction
    }

    update(
      { x: newX, y: newY, w: newW, h: newH },
      left,
      top,
      xResize && !left,
      yResize && !top,
      false
    )
  }

  const handleRotationStart = (e: Event) => {
    if (!isAffineHandleMode()) return
    preventDefault(e)
    onStart()
    initialState = getCurrentState()
    const [tlX, tlY] = getDotCoords(TL)
    const [brX, brY] = getDotCoords(BR)
    ;[contentCenterX, contentCenterY] = getMiddlePointCoords(tlX, tlY, brX, brY)
    const [touchX, touchY] = getTouchCoords(e)
    initialRotation = getAngleDegBetweenTwoPoints(contentCenterX, contentCenterY, touchX, touchY)
    onTouchMove = handleRotationChange
    document.addEventListener(Params.eventMove, onTouchMove)
    document.addEventListener(Params.eventEnd, onTouchEnd)
  }
  const handleRotationChange = (e: Event) => {
    preventDefault(e)
    if (!dragEnabled) {
      return
    }
    const [touchX, touchY] = getTouchCoords(e)
    const deltaRotation =
      initialRotation - getAngleDegBetweenTwoPoints(contentCenterX, contentCenterY, touchX, touchY)
    update({ r: round(initialState.r - deltaRotation, 2) }, false, false, false, false, true)
  }

  const onTouchEnd = (e: Event) => {
    preventDefault(e)
    onEnd(lastState || false)
    document.removeEventListener(Params.eventMove, onTouchMove)
    document.removeEventListener(Params.eventEnd, onTouchEnd)
    initialState =
      lastState =
      initialRotation =
      onTouchMove =
      startDotX =
      startDotY =
      oppositeX =
      oppositeY =
      touchStartX =
      touchStartY =
      contentCenterX =
      contentCenterY =
      resizeAngleCosFraction =
      resizeAngleSinFraction =
        undefined
    dragEnabled = true
  }

  const enable = () => (dragEnabled = true)
  const update = (
    updatedStateKeys: Record<string, any>,
    left: boolean,
    top: boolean,
    right: boolean,
    bottom: boolean,
    rotation: boolean
  ) => {
    const newState = {
      ...initialState,
      ...updatedStateKeys,
    }
    if (!rotation) {
      const minW = Math.max(4, Math.min(LAYER_CONTENT_MIN_SIZE, initialState.w))
      const minH = Math.max(4, Math.min(LAYER_CONTENT_MIN_SIZE, initialState.h))
      if (newState.w < minW || newState.h < minH) {
        return
      }
    }

    newState.x = round(newState.x, 1)
    newState.y = round(newState.y, 1)
    newState.w = round(newState.w, 1)
    newState.h = round(newState.h, 1)
    newState.r = round(newState.r, 1)
    dragEnabled = waitingTime === 0
    if (!isEqual(newState, lastState)) {
      lastState = newState
      onChange(newState, left, top, right, bottom, rotation)
    }
    if (dragEnabled === false) {
      setTimeout(enable, waitingTime)
    }
  }

  const handleResizeChangeR = (e: any) => handleResizeChange(false, false, true, false, false, e)
  const handleResizeChangeL = (e: any) => handleResizeChange(true, false, true, false, false, e)
  const handleResizeChangeT = (e: any) => handleResizeChange(false, true, false, true, false, e)
  const handleResizeChangeB = (e: any) => handleResizeChange(false, false, false, true, false, e)
  const handleResizeChangeTL = (e: any) =>
    handleResizeChange(true, true, true, true, cornerKeepsAspectRatio(), e)
  const handleResizeChangeTR = (e: any) =>
    handleResizeChange(false, true, true, true, cornerKeepsAspectRatio(), e)
  const handleResizeChangeBR = (e: any) =>
    handleResizeChange(false, false, true, true, cornerKeepsAspectRatio(), e)
  const handleResizeChangeBL = (e: any) =>
    handleResizeChange(true, false, true, true, cornerKeepsAspectRatio(), e)
  R.addEventListener(Params.eventStart, (e) => handleResizeStart(e, R, L, handleResizeChangeR))
  L.addEventListener(Params.eventStart, (e) => handleResizeStart(e, L, R, handleResizeChangeL))
  T.addEventListener(Params.eventStart, (e) => handleResizeStart(e, T, B, handleResizeChangeT))
  B.addEventListener(Params.eventStart, (e) => handleResizeStart(e, B, T, handleResizeChangeB))
  TL.addEventListener(Params.eventStart, (e) => handleResizeStart(e, TL, BR, handleResizeChangeTL))
  TR.addEventListener(Params.eventStart, (e) => handleResizeStart(e, TR, BL, handleResizeChangeTR))
  BR.addEventListener(Params.eventStart, (e) => handleResizeStart(e, BR, TL, handleResizeChangeBR))
  BL.addEventListener(Params.eventStart, (e) => handleResizeStart(e, BL, TR, handleResizeChangeBL))
  RT.addEventListener(Params.eventStart, handleRotationStart)
}

export const deselectAllTabs = (container: HTMLElement) => {
  Array.from(container.querySelectorAll('.selected')).forEach((item) => {
    item.classList.remove('selected')
  })
}

export const selectOneTab = (container: HTMLElement, tabName: string) => {
  Array.from(container.querySelectorAll(`div[data-tab-id="${tabName}"]`)).forEach((item) => {
    item.classList.add('selected')
    ;(item as HTMLElement).scrollTop = 1
  })
}
