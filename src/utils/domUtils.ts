import Params from 'main/Params'
import { round } from 'utils/mathUtils'
import { iterateFn, delay, noop } from 'utils/jsUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import spinnerImgUrl from 'static/img/spinner.svg'

const refs: {
  overlaySpinner: HTMLElement | null
  popupContainer: HTMLElement | null
} = {
  overlaySpinner: null,
  popupContainer: null,
}

const initDomUtils = () => {
  if (Params.pagesContainer) {
    refs.overlaySpinner = addSpinnerOverlayTo(Params.pagesContainer) || null
  }
  refs.popupContainer = createDom('drawith__popup-container', 'popup')
}

export const addSpinnerOverlayTo = (
  element: HTMLElement,
  displayNone = true,
  onSpinnerClick: (e: Event) => void = noop
): HTMLElement | false => {
  if (!(element instanceof HTMLElement)) {
    return false
  }

  onSpinnerClick = onSpinnerClick || preventDefault
  const overlay = createDom('drawith__overlay-spinner')
  if (displayNone) {
    overlay.classList.add('displayNone')
  }
  const spinner = document.createElement('img')
  spinner.classList.add('drawith__overlay-spinner-image')
  spinner.src = spinnerImgUrl
  overlay.appendChild(spinner)
  overlay.addEventListener(Params.eventStart, onSpinnerClick)
  element.appendChild(overlay)

  return overlay
}

export const removeSpinnerOverlayFrom = (element: HTMLElement) => {
  element.querySelector('.drawith__overlay-spinner')?.remove()
}

export const preventDefaultTouchOnEls = (...args: any[]) => {
  const elements = args.filter((e) => e instanceof HTMLElement)
  elements.forEach((e) => e.addEventListener(Params.eventStart, preventDefault))
}

export const preventDefault = (e?: Event | any) => {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault()
    if (typeof e.stopPropagation === 'function') {
      e.stopPropagation()
    }
  }
}

export const preventMoveDefaultIfNeeded = (e: any) => {
  let target: HTMLElement | null = e.target
  let startY = 0
  let scrollStartedFromTop = false
  let hasVerticalScroll = false
  let hasHorizontalScroll = false

  while (target && target !== Params.mainContainer) {
    if (target.classList?.contains('scrollable')) {
      hasVerticalScroll = target.scrollHeight > target.clientHeight
      hasHorizontalScroll = target.scrollWidth > target.clientWidth
      break
    }
    target = target.parentNode as HTMLElement | null
  }

  if (target && hasVerticalScroll) {
    if (target.scrollTop === 0) {
      startY = getEventCoordY(e, 0)
      scrollStartedFromTop = true
    } else if (target.scrollTop === target.scrollHeight - target.clientHeight) {
      target.scrollTop = target.scrollHeight - target.clientHeight - 1
    }
  } else if (target && hasHorizontalScroll) {
    if (target.scrollLeft === 0) {
      target.scrollLeft = 1
    } else if (target.scrollLeft === target.scrollWidth - target.clientWidth) {
      target.scrollLeft = target.scrollWidth - target.clientWidth - 1
    }
  }

  const onTouchMove = (ev: any) => {
    if (!hasVerticalScroll && !hasHorizontalScroll) {
      preventDefault(ev)
      if (document.activeElement) {
        const active = document.activeElement as HTMLInputElement
        if (
          active.tagName.toLowerCase() === 'input' &&
          (active.type.toLowerCase() === 'text' || active.type.toLowerCase() === 'password')
        ) {
          active.blur()
        }
      }
    } else if (hasVerticalScroll && scrollStartedFromTop) {
      const moveY = getEventCoordY(ev, 0)
      if (moveY > startY) {
        preventDefault(ev)
      }
    }
  }

  const onTouchEnd = () => {
    Params.pagesContainer?.removeEventListener(Params.eventMove, onTouchMove)
    Params.pagesContainer?.removeEventListener(Params.eventEnd, onTouchEnd)
  }

  Params.pagesContainer?.addEventListener(Params.eventMove, onTouchMove)
  Params.pagesContainer?.addEventListener(Params.eventEnd, onTouchEnd, true)
}

const enableEl = (el: HTMLElement) => {
  el.classList.add('enabled')
  el.classList.remove('disabled')
}

const disableEl = (el: HTMLElement) => {
  el.classList.add('disabled')
  el.classList.remove('enabled')
}

export const enableElements = (els: any) => {
  iterateFn(els, enableEl)
}

export const disableElements = (els: any) => {
  iterateFn(els, disableEl)
}

export function createDom(...classNames: string[]): HTMLDivElement {
  const dom = document.createElement('div')
  for (const cls of classNames) {
    if (cls) dom.classList.add(cls)
  }
  return dom
}

export const setSpinner = async (loading: boolean, duration: number | string = 0) => {
  const dur = typeof duration === 'string' ? parseInt(duration, 10) : duration
  if (loading) {
    await fadeInElements(refs.overlaySpinner)
    if (dur) {
      await delay(dur)
      await fadeOutElements(refs.overlaySpinner)
    }
  } else {
    await fadeOutElements(refs.overlaySpinner)
  }
}

export const getEventCoordX = (e: any, offset = 0): number => {
  if (Array.isArray(e)) {
    return round(e[0].clientX - (offset || 0), 1)
  } else if (e.touches && e.touches[0]) {
    return round(e.touches[0].clientX - (offset || 0), 1)
  } else if (e.changedTouches && e.changedTouches[0]) {
    return round(e.changedTouches[e.changedTouches.length - 1].clientX - (offset || 0), 1)
  } else {
    return round((e.clientX >= 0 ? e.clientX : e.pageX) - (offset || 0), 1)
  }
}

export const getEventCoordY = (e: any, offset = 0): number => {
  if (Array.isArray(e)) {
    return round(e[0].clientY - (offset || 0), 1)
  } else if (e.touches && e.touches[0]) {
    return round(e.touches[0].clientY - (offset || 0), 1)
  } else if (e.changedTouches && e.changedTouches[0]) {
    return round(e.changedTouches[e.changedTouches.length - 1].clientY - (offset || 0), 1)
  } else {
    return round((e.clientY >= 0 ? e.clientY : e.pageY) - (offset || 0), 1)
  }
}

export interface DomRectWithCenter {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
  x: number
  y: number
  centerX: number
  centerY: number
}

export const getDomRect = (dom: HTMLElement, offsetX = 0, offsetY = 0): DomRectWithCenter => {
  const r = dom.getBoundingClientRect()
  const left = r.left - offsetX
  const right = r.right - offsetX
  const top = r.top - offsetY
  const bottom = r.bottom - offsetY
  return {
    left,
    right,
    top,
    bottom,
    width: r.width,
    height: r.height,
    x: left,
    y: top,
    centerX: round(left + r.width / 2, 1),
    centerY: round(top + r.height / 2, 1),
  }
}

export const nodeIsPartOf = (node: any, container: any): boolean => {
  let result = false
  let currentNode = node
  while (
    !result &&
    currentNode &&
    currentNode.tagName &&
    currentNode.tagName.toUpperCase() !== 'BODY'
  ) {
    result = currentNode === container
    currentNode = currentNode.parentNode
  }
  return result
}

export const redrawDomElement = (el: HTMLElement) => {
  if (el instanceof HTMLElement && el.parentNode) {
    const initialScrollTop = el.scrollTop
    const initialScrollLeft = el.scrollLeft
    el.parentNode.appendChild(el)
    el.scrollTop = initialScrollTop
    el.scrollLeft = initialScrollLeft
  }
}

export const filterTouchesByTargets = (
  e: any,
  targets?: (HTMLElement | null | undefined) | (HTMLElement | null | undefined)[]
): any[] => {
  const events = e.touches || [e]
  if (!targets || (Array.isArray(targets) && targets.length === 0)) {
    return Array.from(events)
  }
  const targetList = Array.isArray(targets) ? targets : [targets]
  return Array.prototype.filter.call(events, (ev: any) => targetList.includes(ev.target))
}

export default initDomUtils
