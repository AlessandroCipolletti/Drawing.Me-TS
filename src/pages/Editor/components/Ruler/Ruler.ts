import './ruler.css'

import Params from 'main/Params'
import { editorCalls, registerEditorCalls } from 'pages/Editor/editorCalls'
import { preventDefault } from 'utils/domUtils'
import { cleanRefs, addRotationHandler, removeRotationHandler } from 'utils/moduleUtils'
import { spacing } from 'main/Theme'
import { mount } from 'ui/mount'

import { RulerView } from './RulerView'
import {
  config,
  hide,
  initRulerDimensionAndPosition,
  lock,
  refs,
  resetRulerState,
  show,
  state,
  toggleDragMode,
  unlock,
} from './rulerRender'
import {
  clearRulerTouchState,
  onButtonsTouchEnd,
  isHeldByFingers,
  onButtonsTouchStart,
  onTouchStart,
  RulerStrokeEvents,
  setRulerStrokeCallbacks,
} from './rulerTouch'

export { hide, lock, unlock, isHeldByFingers }

const onRotate = () => {
  initRulerDimensionAndPosition()
  if (state.isVisible) {
    editorCalls.clickButton('ruler')
  }
}

const initDom = async (moduleContainer: HTMLElement) => {
  mount(moduleContainer, RulerView({ refs }))

  initRulerDimensionAndPosition()

  state.containerOffset = {
    left: spacing.EDITOR_TOOLS_WIDTH,
    right: 0,
  }
  config.rulerHeight = spacing.RULER_HEIGHT

  refs.ruler?.addEventListener(Params.eventStart, onTouchStart)
  refs.rulerLevel?.addEventListener(Params.eventStart, onButtonsTouchStart)
  refs.rulerLevel?.addEventListener(Params.eventEnd, onButtonsTouchEnd)
  if (!Params.isMobile) {
    toggleDragMode()
  }
  refs.perpendicularButton?.addEventListener(Params.eventStart, onButtonsTouchStart)
  refs.perpendicularButton?.addEventListener(Params.eventEnd, onButtonsTouchEnd)
  refs.specularButton?.addEventListener(Params.eventStart, onButtonsTouchStart)
  refs.specularButton?.addEventListener(Params.eventEnd, onButtonsTouchEnd)
  if (Params.isMobile) {
    refs.ruler?.addEventListener('gesturestart', preventDefault, true)
    refs.ruler?.addEventListener('gesturechange', preventDefault, true)
    refs.ruler?.addEventListener('gestureend', preventDefault, true)
  }
  addRotationHandler(onRotate)
}

export const init = async (moduleContainer: HTMLElement, events: RulerStrokeEvents) => {
  setRulerStrokeCallbacks(events)
  resetRulerState()
  config.rulerMinOffset = 50 / Params.viewportScale
  config.rulerMarginToDraw = 40 / Params.viewportScale
  await initDom(moduleContainer)
}

export const remove = () => {
  removeRotationHandler(onRotate)
  clearRulerTouchState()
  resetRulerState()
  cleanRefs(refs)
}

registerEditorCalls({
  showRuler: show,
  hideRuler: hide,
})
