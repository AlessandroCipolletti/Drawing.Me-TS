import './header.css'

import Params from 'main/Params'
import { toggleMainMenu, registerMenuButtonAnimations } from 'app/shellState'
import { preventDefault } from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { initBurgerButton } from './burgerButton'
import { addRotationHandler } from 'utils/moduleUtils'
import { spacing } from 'main/Theme'
import { mount } from 'ui/mount'
import { HeaderView } from './HeaderView'

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

const initDom = async () => {
  const container = mount(Params.pagesContainer, HeaderView({ refs }))
  refs.container = container
  if (refs.menuButton) {
    refs.menuButton.remove()
    addHeaderButton(refs.menuButton, 'left')
    refs.menuButton.utils = initBurgerButton(refs.menuButton)
    registerMenuButtonAnimations(refs.menuButton.utils)
    refs.menuButton.addEventListener(Params.eventStart, toggleMainMenu)
  }

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
