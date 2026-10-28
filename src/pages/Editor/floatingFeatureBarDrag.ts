import Params from 'main/Params'
import { getEventCoordX, getEventCoordY, preventDefault } from 'utils/domUtils'
import type { PointerTouchEvent } from './editorTypes'
import {
  applyFloatingBarScreenPosition,
  clampFloatingBarCenter,
  setFloatingBarManualPosition,
  type FloatingFeatureBarId,
} from './floatingFeatureBarLayout'

type CanvasOffset = { left: number; top: number; right: number; bottom: number }

let dragBarId: FloatingFeatureBarId | false = false
let dragBarEl: HTMLElement | null = null
let dragHandleEl: HTMLElement | null = null
let dragOriginX = 0
let dragOriginY = 0
let dragStartLeft = 0
let dragStartTop = 0
let getCanvasOffset: () => CanvasOffset = () => ({ left: 0, top: 0, right: 0, bottom: 0 })

const parseBarCenterLeft = (barEl: HTMLElement): number => {
  const left = barEl.style.left
  if (left.endsWith('px')) return parseFloat(left)
  const rect = barEl.getBoundingClientRect()
  return rect.left + rect.width / 2
}

const parseBarTop = (barEl: HTMLElement): number => {
  const top = barEl.style.top
  if (top.endsWith('px')) return parseFloat(top)
  return barEl.getBoundingClientRect().top
}

const endDrag = () => {
  dragHandleEl?.classList.remove('editor-floating-bar__drag-handle--active')
  dragBarId = false
  dragBarEl = null
  dragHandleEl = null
  window.removeEventListener(Params.eventMove, onDragMove)
  window.removeEventListener(Params.eventEnd, onDragEnd)
  window.removeEventListener(Params.eventCanceled, onDragEnd)
}

const onDragMove = (e: Event) => {
  if (!dragBarId || !dragBarEl) return
  const touchEvent = e as PointerTouchEvent
  const x = getEventCoordX(touchEvent, 0)
  const y = getEventCoordY(touchEvent, 0)
  const nextLeft = dragStartLeft + (x - dragOriginX)
  const nextTop = dragStartTop + (y - dragOriginY)
  const clamped = clampFloatingBarCenter(dragBarEl, nextLeft, nextTop, getCanvasOffset())
  applyFloatingBarScreenPosition(dragBarEl, clamped.left, clamped.top)
  setFloatingBarManualPosition(dragBarId, clamped.left, clamped.top)
}

const onDragEnd = () => {
  endDrag()
}

const onHandleStart = (e: Event) => {
  const handle = e.currentTarget as HTMLElement
  const id = handle.getAttribute('data-floating-bar-id') as FloatingFeatureBarId | null
  if (!id) return
  const barEl = handle.closest('.params-container') as HTMLElement | null
  if (!barEl || barEl.classList.contains('displayNone')) return
  preventDefault(e)
  e.stopPropagation()
  const touchEvent = e as PointerTouchEvent
  dragBarId = id
  dragBarEl = barEl
  dragHandleEl = handle
  dragOriginX = getEventCoordX(touchEvent, 0)
  dragOriginY = getEventCoordY(touchEvent, 0)
  dragStartLeft = parseBarCenterLeft(barEl)
  dragStartTop = parseBarTop(barEl)
  handle.classList.add('editor-floating-bar__drag-handle--active')
  window.addEventListener(Params.eventMove, onDragMove, { passive: false })
  window.addEventListener(Params.eventEnd, onDragEnd)
  window.addEventListener(Params.eventCanceled, onDragEnd)
}

export const initFloatingFeatureBarDrag = (offsetProvider: () => CanvasOffset) => {
  getCanvasOffset = offsetProvider
  document.querySelectorAll('[data-floating-bar-id]').forEach((handle) => {
    handle.removeEventListener(Params.eventStart, onHandleStart)
    handle.addEventListener(Params.eventStart, onHandleStart)
  })
}
