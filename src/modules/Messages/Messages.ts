import './messages.css'

import Params from 'main/Params'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import { preventDefault, redrawDomElement } from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { delay, debounce } from 'utils/jsUtils'
import { mount } from 'ui/mount'
import { MessagesView, MessagesRefs } from './MessagesView'

const config = {
  defaultCloseDelay: 3500,
}

interface MessagesState {
  messageIsVisible: boolean
  panelIsVisible: boolean
  currentIsMandatory: boolean
  currentPanelOnClose: (() => void) | false
  currentConfirmCallback: (() => void) | null
  currentCancelCallback: (() => void) | null
}

const state: MessagesState = {
  messageIsVisible: false,
  panelIsVisible: false,
  currentIsMandatory: false,
  currentPanelOnClose: false,
  currentConfirmCallback: null,
  currentCancelCallback: null,
}

const refs: MessagesRefs = {
  messageDom: null,
  messageText: null,
  overlay: null,
  confirmButton: null,
  cancelButton: null,
  panel: null,
  updateDom: null,
  currentPanelcontent: null,
  icon: null,
  inputText: null,
}

const labels = {
  ok: 'Ok',
  cancel: 'Cancel',
}

let autoCloseTimeout: ReturnType<typeof setTimeout> | false = false
const messagesStack: Array<{
  type: keyof typeof allMessageTypes
  msg: string
  mandatory?: boolean
  onConfirm?: () => void
  onCancel?: () => void
}> = []

const setType = (type: string) => {
  resetType()
  refs.messageDom?.classList.add(`messages__container-${type}`)
  refs.icon?.classList.add(`svg-icon-${type}`)
}

const resetType = () => {
  refs.messageDom?.classList.remove(
    'messages__container-success',
    'messages__container-error',
    'messages__container-info',
    'messages__container-alert',
    'messages__container-confirm',
    'messages__container-input',
    'messages__container-warning'
  )
  refs.icon?.classList.remove(
    'svg-icon-success',
    'svg-icon-error',
    'svg-icon-info',
    'svg-icon-alert',
    'svg-icon-confirm',
    'svg-icon-input',
    'svg-icon-warning'
  )
}

const show = (mandatory = false, closeDelay = config.defaultCloseDelay) => {
  state.currentIsMandatory = mandatory
  addGlobalStatus('drawith__MESSAGE-OPEN')
  if (mandatory) {
    addGlobalStatus('drawith__MESSAGE-MANDATORY-OPEN')
    if (refs.overlay && !state.panelIsVisible) fadeInElements(refs.overlay)
  } else {
    autoCloseTimeout = setTimeout(hide, closeDelay)
  }
}

const hide = (preventNextMessage = false) => {
  state.messageIsVisible = false
  removeGlobalStatus('drawith__MESSAGE-OPEN')
  if (state.currentIsMandatory) {
    removeGlobalStatus('drawith__MESSAGE-MANDATORY-OPEN')
    if (refs.overlay && !state.panelIsVisible) fadeOutElements(refs.overlay)
    state.currentIsMandatory = false
  }
  if (autoCloseTimeout) {
    clearTimeout(autoCloseTimeout)
    autoCloseTimeout = false
  }
  if (!preventNextMessage) {
    setTimeout(onHide, 200)
  }
}

const onHide = () => {
  const nextMessage = messagesStack.splice(0, 1)[0]
  if (nextMessage) {
    const fn = allMessageTypes[nextMessage.type] as any
    if (nextMessage.type === 'input' || nextMessage.type === 'confirm') {
      fn(nextMessage.msg, nextMessage.mandatory, nextMessage.onConfirm, nextMessage.onCancel)
    } else {
      fn(nextMessage.msg)
    }
  }
}

const makeMessage = (
  type: keyof typeof allMessageTypes,
  msg: string,
  mandatory: boolean,
  closeDelay = config.defaultCloseDelay
) => {
  if (state.messageIsVisible) {
    messagesStack.push({ type, msg, mandatory })
  } else {
    state.messageIsVisible = true
    setType(type)
    if (refs.messageDom) redrawDomElement(refs.messageDom)
    if (refs.messageText) refs.messageText.innerHTML = msg
    requestAnimationFrame(() => {
      show(mandatory, closeDelay)
    })
  }
}

const onMessageTouchStart = async (e: Event) => {
  if (e.target === refs.inputText) {
    e.stopPropagation()
    return
  }
  preventDefault(e)
  if (
    refs.messageDom?.classList.contains('messages__container-success') ||
    refs.messageDom?.classList.contains('messages__container-warning') ||
    refs.messageDom?.classList.contains('messages__container-error') ||
    refs.messageDom?.classList.contains('messages__container-info')
  ) {
    await delay(50)
    hide()
  }
}

const onConfirmButtonClick = (e: Event) => {
  preventDefault(e)
  refs.inputText?.blur?.()
  const callback = state.currentConfirmCallback
  state.currentConfirmCallback = null
  state.currentCancelCallback = null
  hide()
  callback?.()
}

const onCancelButtonClick = (e: Event) => {
  preventDefault(e)
  refs.inputText?.blur?.()
  const callback = state.currentCancelCallback
  state.currentConfirmCallback = null
  state.currentCancelCallback = null
  hide()
  callback?.()
}

const alert = (msg: string, callback?: () => void) => {
  if (state.messageIsVisible) {
    hide(true)
  }
  state.currentConfirmCallback = callback || null
  state.currentCancelCallback = null
  makeMessage('alert', msg, true)
}

export const info = (msg: string, closeDelay = config.defaultCloseDelay) => {
  makeMessage('info', msg, false, closeDelay)
}

const success = (msg: string, closeDelay = config.defaultCloseDelay) => {
  makeMessage('success', msg, false, closeDelay)
}

export const error = (msg: string, closeDelay = config.defaultCloseDelay) => {
  makeMessage('error', msg, false, closeDelay * 1.4)
}

const warning = (msg: string, closeDelay = config.defaultCloseDelay) => {
  makeMessage('warning', msg, false, closeDelay)
}

export const update = (msg: string) => {
  if (!refs.updateDom) return
  refs.updateDom.innerHTML = msg
  fadeInElements(refs.updateDom)
  closeUpdateMsg()
}

const closeUpdateMsg = debounce(() => {
  if (refs.updateDom) fadeOutElements(refs.updateDom)
}, 1500)

export const confirm = (
  msg: string,
  mandatory = true,
  closeDelay = config.defaultCloseDelay
): Promise<boolean> => {
  return new Promise((resolve) => {
    if (state.messageIsVisible) {
      hide(true)
    }
    state.currentConfirmCallback = () => resolve(true)
    state.currentCancelCallback = () => resolve(false)
    makeMessage('confirm', msg, mandatory, closeDelay)
  })
}

export const input = (
  msg: string,
  initialValue?: string,
  mandatory = true,
  closeDelay = config.defaultCloseDelay
): Promise<string | null> => {
  return new Promise((resolve) => {
    if (state.messageIsVisible) {
      hide(true)
    }
    if (refs.inputText) {
      refs.inputText.value = initialValue || ''
    }
    state.currentConfirmCallback = () => resolve(refs.inputText ? refs.inputText.value : '')
    state.currentCancelCallback = () => resolve(null)
    makeMessage('input', msg, mandatory, closeDelay)
    requestAnimationFrame(() => {
      refs.inputText?.focus?.()
      refs.inputText?.select?.()
    })
  })
}

export const panel = async (
  content: HTMLElement,
  {
    mandatory = false,
    force = false,
    onClose = false,
  }: { mandatory?: boolean; force?: boolean; onClose?: (() => void) | false } = {}
) => {
  if (!refs.panel || !refs.overlay) return
  if (!state.panelIsVisible || force) {
    state.panelIsVisible = true
    if (refs.currentPanelcontent) {
      refs.currentPanelcontent.remove()
      refs.currentPanelcontent = null
    }
    state.currentPanelOnClose = onClose
    content.classList.add('panel-content')
    refs.panel.innerHTML = ''
    refs.panel.appendChild(content)
    refs.currentPanelcontent = content
    fadeInElements([refs.panel, refs.overlay])
    if (!mandatory) {
      refs.overlay.addEventListener(Params.eventStart, panelCloseClick)
    }
  } else if (Object.is(refs.currentPanelcontent, content)) {
    await fadeOutElements([refs.panel, refs.overlay])
    onPanelClose()
  }
}

const panelCloseClick = async (e: Event) => {
  preventDefault(e)
  if (state.panelIsVisible && refs.panel && refs.overlay) {
    refs.overlay.removeEventListener(Params.eventStart, panelCloseClick)
    await fadeOutElements([refs.panel, refs.overlay])
    onPanelClose()
  }
}

const onPanelClose = () => {
  state.panelIsVisible = false
  refs.currentPanelcontent?.remove()
  refs.currentPanelcontent = null
  if (state.currentPanelOnClose) {
    state.currentPanelOnClose()
    state.currentPanelOnClose = false
  }
}

const allMessageTypes = { alert, info, success, error, confirm, input, panel, warning }

const initDom = async () => {
  mount(Params.pagesContainer, MessagesView({ labels, refs }))

  refs.messageDom?.addEventListener(Params.eventStart, onMessageTouchStart)
  refs.confirmButton?.addEventListener(Params.eventStart, onConfirmButtonClick)
  refs.cancelButton?.addEventListener(Params.eventStart, onCancelButtonClick)
  refs.inputText?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      onConfirmButtonClick(e)
    } else if (e.key === 'Escape') {
      onCancelButtonClick(e)
    }
  })
  refs.updateDom?.addEventListener(Params.eventStart, preventDefault)
  refs.overlay?.addEventListener('gesturestart', preventDefault, true)
  refs.overlay?.addEventListener(
    Params.eventStart,
    (e) => {
      e.preventDefault()
    },
    true
  )
}

export const init = async () => {
  await initDom()
}
