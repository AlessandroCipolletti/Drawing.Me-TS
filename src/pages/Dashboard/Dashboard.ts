import './dashboard.css'
import spinnerImg from 'static/img/spinner.svg'

import Params from 'main/Params'
import * as GPS from './modules/GPS'
import * as Cache from './modules/Cache'
import * as Messages from 'modules/Messages'
import * as Editor from 'pages/Editor'
import { spacing } from 'main/Theme'
import { goToPage } from 'app/navigation'
import { round, getNumberInBetween } from 'utils/mathUtils'
import { deepCopy } from 'utils/jsUtils'
import {
  cleanRefs,
  addRotationHandler,
  removeRotationHandler,
  addGlobalStatus,
  removeGlobalStatus,
} from 'utils/moduleUtils'
import { preventDefault, setSpinner, getEventCoordX, getEventCoordY } from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { handlePointerEvents } from 'utils/pointerEventsUtils'
import { mount } from 'ui/mount'
import { DashboardView, DashboardRefs } from './DashboardView'

const config = {
  svgNamespace: 'http://www.w3.org/2000/svg',
  xlinkNamespace: 'http://www.w3.org/1999/xlink',
  maxZoomScale: 4,
  minZoomScale: 0.05,
}

interface DashboardState {
  maxWidth: number
  maxHeight: number
  width: number
  height: number
  centerX: number
  centerY: number
  scale: number
  gestureStartScale: number
  dragStartX: number
  dragStartY: number
  dragStartCenterX: number
  dragStartCenterY: number
  isDragging: boolean
  targetDrawingId: number | false
}

const initialState: DashboardState = {
  maxWidth: 0,
  maxHeight: 0,
  width: 0,
  height: 0,
  centerX: 0,
  centerY: 0,
  scale: 1,
  gestureStartScale: 1,
  dragStartX: 0,
  dragStartY: 0,
  dragStartCenterX: 0,
  dragStartCenterY: 0,
  isDragging: false,
  targetDrawingId: false,
}

let state: DashboardState = deepCopy(initialState)

const refs: DashboardRefs = {
  container: null,
  svg: null,
  worldGroup: null,
  spinner: null,
  zoomLabel: null,
  zoomLabelRect: null,
  drawButton: null,
  cleanPointerEvents: null,
}

const labels = {
  draw: 'Pin drawing here (1px = 1mm)',
  pinnedAtCurrentPos: 'Saved at current GPS position (1px = 1mm)',
}

const updateZoomLabel = () => {
  if (!refs.zoomLabel) return
  refs.zoomLabel.textContent = `${round(state.scale * 100, 0)}%`
}

const renderWorldSheet = () => {
  if (!refs.worldGroup || !refs.svg) return
  refs.worldGroup.innerHTML = ''

  const viewW = state.width / state.scale
  const viewH = state.height / state.scale

  const currentPos = GPS.getCurrentCoordinates()
  const posScreenX = round(state.width / 2 + (currentPos.x - state.centerX) * state.scale, 1)
  const posScreenY = round(state.height / 2 - (currentPos.y - state.centerY) * state.scale, 1)

  const markerCircle = document.createElementNS(config.svgNamespace, 'circle')
  markerCircle.setAttributeNS(null, 'cx', String(posScreenX))
  markerCircle.setAttributeNS(null, 'cy', String(posScreenY))
  markerCircle.setAttributeNS(null, 'r', String(Math.max(6, round(10 * state.scale, 1))))
  markerCircle.setAttributeNS(null, 'fill', 'rgba(135, 206, 250, 0.35)')
  markerCircle.setAttributeNS(null, 'stroke', '#2196f3')
  markerCircle.setAttributeNS(null, 'stroke-width', '2')
  refs.worldGroup.appendChild(markerCircle)

  const visibleDrawings = Cache.getDrawingsInViewport(
    state.centerX,
    state.centerY,
    viewW * 2,
    viewH * 2
  )

  for (const item of visibleDrawings) {
    const screenX = round(state.width / 2 + (item.x - state.centerX) * state.scale, 1)
    const screenY = round(
      state.height / 2 - (item.y + item.height - state.centerY) * state.scale,
      1
    )
    const screenW = round((item.width / item.px4mm) * state.scale, 1)
    const screenH = round((item.height / item.px4mm) * state.scale, 1)

    const bgRect = document.createElementNS(config.svgNamespace, 'rect')
    bgRect.setAttributeNS(null, 'x', String(screenX))
    bgRect.setAttributeNS(null, 'y', String(screenY))
    bgRect.setAttributeNS(null, 'width', String(screenW))
    bgRect.setAttributeNS(null, 'height', String(screenH))
    bgRect.setAttributeNS(null, 'fill', '#ffffff')
    bgRect.setAttributeNS(null, 'stroke', '#e0e0e0')
    bgRect.setAttributeNS(null, 'stroke-width', '1')
    bgRect.setAttributeNS(null, 'rx', '4')
    refs.worldGroup.appendChild(bgRect)

    const img = document.createElementNS(config.svgNamespace, 'image')
    img.setAttributeNS(null, 'id', `dashboard-drawing-${item.id}`)
    img.setAttributeNS(null, 'data-local-id', String(item.localDbId))
    img.setAttributeNS(null, 'width', String(screenW))
    img.setAttributeNS(null, 'height', String(screenH))
    img.setAttributeNS(null, 'x', String(screenX))
    img.setAttributeNS(null, 'y', String(screenY))
    img.setAttributeNS(config.xlinkNamespace, 'xlink:href', item.base64)
    img.setAttribute('href', item.base64)
    ;(img as unknown as HTMLElement).style.cursor = 'pointer'
    refs.worldGroup.appendChild(img)
  }

  updateZoomLabel()
}

const onTouchStart = (_e: any, touchEvent: any) => {
  state.isDragging = true
  state.dragStartX = getEventCoordX(touchEvent)
  state.dragStartY = getEventCoordY(touchEvent)
  state.dragStartCenterX = state.centerX
  state.dragStartCenterY = state.centerY
}

const onTouchMove = (_e: any, touchEvent: any) => {
  if (!state.isDragging) return
  const currentX = getEventCoordX(touchEvent)
  const currentY = getEventCoordY(touchEvent)
  const dx = (currentX - state.dragStartX) / state.scale
  const dy = (currentY - state.dragStartY) / state.scale

  state.centerX = round(state.dragStartCenterX - dx, 1)
  state.centerY = round(state.dragStartCenterY + dy, 1)
  renderWorldSheet()
}

const onTouchEnd = (e: any) => {
  const movedDistance = Math.hypot(
    getEventCoordX(e) - state.dragStartX,
    getEventCoordY(e) - state.dragStartY
  )
  state.isDragging = false

  if (movedDistance < 8 && e?.target) {
    const localId = (e.target as Element).getAttribute?.('data-local-id')
    if (localId) {
      setSpinner(true)
      goToPage(`editor/open/${localId}`)
    }
  }
}

const onGestureStart = (x: number, y: number) => {
  state.gestureStartScale = state.scale
  state.dragStartX = x
  state.dragStartY = y
  state.dragStartCenterX = state.centerX
  state.dragStartCenterY = state.centerY
}

const onGestureChange = (x: number, y: number, scaleFactor: number) => {
  state.scale = getNumberInBetween(
    round(state.gestureStartScale * scaleFactor, 3),
    config.minZoomScale,
    config.maxZoomScale
  )
  const dx = (x - state.dragStartX) / state.scale
  const dy = (y - state.dragStartY) / state.scale
  state.centerX = round(state.dragStartCenterX - dx, 1)
  state.centerY = round(state.dragStartCenterY + dy, 1)
  renderWorldSheet()
}

const onGestureEnd = () => {
  state.gestureStartScale = state.scale
}

const onWheel = (e: WheelEvent) => {
  preventDefault(e)
  if (e.ctrlKey) {
    const factor = 1 - e.deltaY * 0.01
    state.scale = getNumberInBetween(
      round(state.scale * factor, 3),
      config.minZoomScale,
      config.maxZoomScale
    )
  } else if (Math.abs(e.deltaX) > 0 && Math.abs(e.deltaX) >= Math.abs(e.deltaY)) {
    state.centerX = round(state.centerX + e.deltaX / state.scale, 1)
    state.centerY = round(state.centerY - e.deltaY / state.scale, 1)
  } else {
    const factor = e.deltaY < 0 ? 1.12 : 0.9
    state.scale = getNumberInBetween(
      round(state.scale * factor, 3),
      config.minZoomScale,
      config.maxZoomScale
    )
  }
  renderWorldSheet()
}

const onDrawButtonTap = async (e: Event) => {
  preventDefault(e)
  const drawings = Cache.getCachedDrawings()
  if (drawings.length > 0) {
    const targetId =
      (state.targetDrawingId &&
        drawings.find((d) => d.localDbId === state.targetDrawingId)?.localDbId) ||
      drawings[0].localDbId
    await Cache.pinDrawingAtCurrentPosition(targetId, state.centerX, state.centerY)
    renderWorldSheet()
    Messages.info(labels.pinnedAtCurrentPos, 2000)
  } else {
    setSpinner(true)
    goToPage('editor/open/')
  }
}

const onRotate = () => {
  state.width = Params.width
  state.height = Params.height - spacing.HEADER_HEIGHT
  renderWorldSheet()
}

const initDom = async () => {
  mount(
    Params.pagesContainer,
    DashboardView({
      marginTop: spacing.HEADER_HEIGHT,
      labelToDraw: labels.draw,
      zoomRectCoord: spacing.ONE_REM,
      zoomRectBorderRadius: spacing.ONE_REM,
      zoomRectWidth: spacing.ONE_REM * 8,
      zoomRectHeight: spacing.ONE_REM * 4,
      zoomLabelX: spacing.ONE_REM * 3,
      zoomLabelY: spacing.ONE_REM * 3.5,
      spinnerImg,
      refs,
    })
  )

  refs.spinner?.classList.remove('displayNone')

  if (refs.svg) {
    refs.cleanPointerEvents = handlePointerEvents(refs.svg as unknown as HTMLElement, {
      onSingleTouchStart: onTouchStart,
      onSingleTouchMove: onTouchMove,
      onSingleTouchEnd: onTouchEnd,
      onGestureStart,
      onGestureChange,
      onGestureEnd,
    })
    refs.svg.addEventListener('wheel', onWheel, { passive: false })
  }

  refs.drawButton?.addEventListener(Params.eventStart, onDrawButtonTap)
}

export const open = async (drawingId?: number | string | false) => {
  state = deepCopy(initialState)
  const resolvedId =
    drawingId && drawingId !== 'false' ? Number(drawingId) : Editor.getLastActiveDrawingId()
  state.targetDrawingId = resolvedId || false
  state.width = Params.width
  state.height = Params.height - spacing.HEADER_HEIGHT

  setSpinner(true)
  await initDom()
  if (refs.container) fadeInElements(refs.container)
  setSpinner(false)

  const [maxWidth, maxHeight] = await GPS.init()
  state.maxWidth = maxWidth
  state.maxHeight = maxHeight

  const [currentX, currentY] = GPS.currentGps2px()
  state.centerX = currentX
  state.centerY = currentY

  await Cache.loadLocalDashboardDrawings()
  renderWorldSheet()

  if (refs.spinner) {
    fadeOutElements(refs.spinner)
  }

  addRotationHandler(onRotate)
  addGlobalStatus('drawith__DASHBOARD-OPEN')
}

export const close = async () => {
  refs.cleanPointerEvents?.()
  refs.svg?.removeEventListener('wheel', onWheel)
  GPS.stopWatchingPosition()
  removeRotationHandler(onRotate)
  removeGlobalStatus('drawith__DASHBOARD-OPEN')
  if (refs.container) await fadeOutElements(refs.container)
  Cache.clean()
  cleanRefs(refs)
  state = deepCopy(initialState)
}
