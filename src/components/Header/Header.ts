import tplHeader from './header.tpl?raw'
import './header.css'

import Params from 'main/Params'
import { toggleMainMenu } from 'main/main'
import { preventDefault, loadTemplate } from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { initBurgerButton } from './burgerButton'
import { addRotationHandler } from 'utils/moduleUtils'
import { spacing } from 'main/Theme'

const state: {
  rightButtons: HTMLElement[]
  leftButtons: HTMLElement[]
} = {
  rightButtons: [],
  leftButtons: [],
}

const refs: {
  container: HTMLElement | null
  menuButton: (HTMLElement & { utils?: ReturnType<typeof initBurgerButton> }) | null
  refreshIcon: HTMLElement | null
} = {
  container: null,
  menuButton: null,
  refreshIcon: null,
}

const addHeaderButton = (button: HTMLElement, side: 'left' | 'right' = 'left', big = false) => {
  button.classList.add('header__button')
  if (big) {
    button.classList.add('header__button-big')
  }
  if (side === 'right') {
    state.rightButtons.push(button)
    updateRightButtonsPosition()
  } else {
    state.leftButtons.push(button)
    updateLeftButtonsPosition()
  }
  refs.container?.appendChild(button)
}

const updateRightButtonsPosition = () => {
  const padding =
    Params.isPhone && Params.width > Params.height ? spacing.PHONE_LANDSCAPE_PADDING : 0
  for (let i = 0; i < state.rightButtons.length; i++) {
    state.rightButtons[i].style.right =
      `${padding + i * spacing.HEADER_BUTTON_WIDTH + 0.5 * spacing.ONE_REM}px`
  }
}

const updateLeftButtonsPosition = () => {
  const padding =
    Params.isPhone && Params.width > Params.height ? spacing.PHONE_LANDSCAPE_PADDING : 0
  for (let i = 0; i < state.leftButtons.length; i++) {
    state.leftButtons[i].style.left =
      `${padding + i * spacing.HEADER_BUTTON_WIDTH + 0.5 * spacing.ONE_REM}px`
  }
}

export const hide = () => {
  if (refs.container) fadeOutElements([refs.container])
}

export const show = () => {
  if (refs.container) fadeInElements([refs.container])
}

export let menuButtonAnimations: ReturnType<typeof initBurgerButton>

const initDom = async () => {
  const dom = await loadTemplate(tplHeader, {}, Params.pagesContainer)
  const container = (Array.isArray(dom) ? dom[0] : dom) as HTMLElement
  refs.container = container
  refs.menuButton = container.querySelector('.menu-button')
  if (refs.menuButton) {
    refs.menuButton.remove()
    addHeaderButton(refs.menuButton, 'left')
    refs.menuButton.utils = initBurgerButton(refs.menuButton)
    menuButtonAnimations = refs.menuButton.utils
    refs.menuButton.addEventListener(Params.eventStart, toggleMainMenu)
  }

  refs.refreshIcon = container.querySelector('.header__refresh-icon')
  if (refs.refreshIcon) {
    refs.refreshIcon.remove()
    addHeaderButton(refs.refreshIcon, 'left')
  }

  container.addEventListener(Params.eventStart, preventDefault)
}

const onRotate = () => {
  updateRightButtonsPosition()
  updateLeftButtonsPosition()
}

export const init = async () => {
  await initDom()
  addRotationHandler(onRotate)
}
