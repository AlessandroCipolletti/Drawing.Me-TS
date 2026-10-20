import Params from 'main/Params'
import { preventDefault } from 'utils/domUtils'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'

export interface MenuButtonAnimations {
  open: () => void
  close: () => void
}

const PREVENT_REFRESH_LABEL = 'Changes may not be saved'

let menuIsOpen = false
let menuAnimations: MenuButtonAnimations | null = null
let menuRouteSubscriber: ((route: string) => void) | null = null

export const registerMenuButtonAnimations = (animations: MenuButtonAnimations) => {
  menuAnimations = animations
}

export const registerMenuRouteSubscriber = (fn: ((route: string) => void) | null) => {
  menuRouteSubscriber = fn
}

export const notifyMenuRouteChanged = (route: string) => {
  if (menuRouteSubscriber) {
    menuRouteSubscriber(route)
    return
  }
  document.querySelector('.drawith__menu-item.selected')?.classList.remove('selected')
  if (route === 'folder') {
    document.querySelector('.drawith__menu-item-folder')?.classList.add('selected')
  } else if (route === 'dashboard') {
    document.querySelector('.drawith__menu-item-dashboard')?.classList.add('selected')
  } else if (route === 'info') {
    document.querySelector('.drawith__menu-item-about')?.classList.add('selected')
  }
}

export const addPreventPageRefresh = () => {
  window.onbeforeunload = () => PREVENT_REFRESH_LABEL
}

export const removePreventPageRefresh = () => {
  window.onbeforeunload = null
}

const openMainMenu = (e?: Event) => {
  if (e) {
    preventDefault(e)
  }
  menuIsOpen = true
  addGlobalStatus('drawith__MENU-OPEN')
  Params.pagesContainer?.addEventListener(Params.eventStart, closeMainMenu)
  menuAnimations?.open()
}

export const closeMainMenu = (e?: Event) => {
  if (e) {
    preventDefault(e)
  }
  menuIsOpen = false
  removeGlobalStatus('drawith__MENU-OPEN')
  Params.pagesContainer?.removeEventListener(Params.eventStart, closeMainMenu)
  menuAnimations?.close()
}

export const toggleMainMenu = (e: Event) => {
  preventDefault(e)
  if (menuIsOpen) {
    closeMainMenu()
  } else {
    openMainMenu()
  }
}
