import tplApp from './main.tpl?raw'
import './main.css'

import Params from 'main/Params'
import * as Theme from './Theme'
import initPolyfills from './polyfills'
import { round } from 'utils/mathUtils'
import * as Messages from 'modules/Messages'
import * as Coworking from 'modules/Coworking'
import { initLocalDb } from 'utils/localDbUtils'
import { delay, securizeAsyncFn, debounce } from 'utils/jsUtils'
import { init as initCoworking } from 'modules/Coworking'
import { init as initImageUtils } from 'utils/imageUtils'
import { init as initHeader, menuButtonAnimations } from 'components/Header'
import initDomUtils, {
  loadTemplate,
  preventDefault,
  setSpinner,
  preventMoveDefaultIfNeeded,
} from 'utils/domUtils'
import {
  openPageNotSupported,
  isSupportedOs,
  openPageFolder,
  openPageDashboard,
  openPageAboutUs,
  openCurrentUrlPage,
} from 'modules/Router'
import {
  getRealScreenWidth,
  getRealScreenHeight,
  cleanEventsForNextRefresh,
  mergeObject,
  handleGlobalResize,
  addGlobalStatus,
  removeGlobalStatus,
} from 'utils/moduleUtils'

const AppState = {
  NAME: 'Drawith.Me',
  VERSION: '2.6.0',
  DEBUG: true,
}
const state = {
  menuIsOpen: false,
}
const refs: {
  mainContainer: HTMLElement | null
  pagesContainer: HTMLElement | null
} = {
  mainContainer: null,
  pagesContainer: null,
}
const labels = {
  folderPageLabel: 'My drawings',
  dashboardPageLabel: 'World GPS sheet',
  aboutUs: 'About Drawith.Me',
  genericError: 'Generic Error',
  preventRefresh: 'Changes may not be saved',
}

export const addPreventPageRefresh = () => {
  window.onbeforeunload = () => labels.preventRefresh
}

export const removePreventPageRefresh = () => {
  window.onbeforeunload = null
}

const attachRotationHandler = () => {
  const handleRotation = debounce((event: Event) => {
    handleGlobalResize(event)
    Coworking.updateClientEnvironment()
  }, 200)

  if ('onorientationchange' in window) {
    let handledByRotation = false
    const resetRotation = () => {
      handledByRotation = false
    }

    ;(window as Window).addEventListener('resize', (e: Event) => {
      if (!handledByRotation) {
        handleRotation(e)
      }
    })
    ;(window as Window).addEventListener('orientationchange', (e: Event) => {
      handleRotation(e)
      handledByRotation = true
      setTimeout(resetRotation, 16)
    })
  } else {
    ;(window as Window).addEventListener('resize', handleRotation, false)
  }
}

export const openMainMenu = (e?: Event) => {
  if (e) {
    preventDefault(e)
  }
  state.menuIsOpen = true
  addGlobalStatus('drawith__MENU-OPEN')
  refs.pagesContainer?.addEventListener(Params.eventStart, closeMainMenu)
  menuButtonAnimations.open()
}

export const closeMainMenu = (e?: Event) => {
  if (e) {
    preventDefault(e)
  }
  state.menuIsOpen = false
  removeGlobalStatus('drawith__MENU-OPEN')
  refs.pagesContainer?.removeEventListener(Params.eventStart, closeMainMenu)
  menuButtonAnimations.close()
}

export const toggleMainMenu = (e: Event) => {
  preventDefault(e)
  if (state.menuIsOpen) {
    closeMainMenu()
  } else {
    openMainMenu()
  }
}

const initTheme = () => {
  Theme.init()
  for (const [key, val] of Object.entries(Theme.spacing)) {
    const varName = key.toLowerCase().replace(/_/g, '-')
    const varValue = typeof val === 'number' ? `${val}px` : val
    document.documentElement.style.setProperty(`--${varName}`, String(varValue))
  }
  const htmlEl = document.querySelector('html')
  if (htmlEl) htmlEl.style.fontSize = 'var(--one-rem)'
  document.documentElement.style.setProperty('--viewport-scale', String(Params.viewportScale))

  for (const [key, varValue] of Object.entries(Theme.timing)) {
    const varName = key.toLowerCase().replaceAll('_', '-')
    document.documentElement.style.setProperty(`--${varName}`, varValue)
  }

  for (const [key, pal] of Object.entries(Theme.palette)) {
    if (Array.isArray(pal)) {
      for (let j = 0; j < pal.length; j++) {
        document.documentElement.style.setProperty(`--palette-${key}-${j}`, pal[j])
      }
    } else {
      document.documentElement.style.setProperty(`--palette-${key}`, pal)
    }
  }
}

const addEnviromentGlobalStatus = () => {
  if (Params.isMobile) {
    addGlobalStatus('drawith__MOBILE')
    if (Params.isPhone) {
      addGlobalStatus('drawith__PHONE')
    } else if (Params.isTablet) {
      addGlobalStatus('drawith__TABLET')
    }
  } else {
    addGlobalStatus('drawith__DESKTOP')
  }
  if (Params.ios) {
    addGlobalStatus('drawith__IOS')
    if (Params.ipad) {
      addGlobalStatus('drawith__IPAD')
    } else {
      addGlobalStatus('drawith__IPHONE')
    }
  } else if (Params.android) {
    addGlobalStatus('drawith__ANDROID')
  }
}

const setViewport = async () => {
  const currentTag = document.getElementById('metaViewport')
  if (currentTag && currentTag.parentNode) {
    currentTag.parentNode.removeChild(currentTag)
  }

  const attributes: string[] = []
  attributes.push('initial-scale=' + Params.viewportScale)
  attributes.push('minimum-scale=' + Params.viewportScale)
  attributes.push('maximum-scale=' + Params.viewportScale)
  attributes.push('user-scalable=no')
  attributes.push('viewport-fit=cover')
  attributes.push('shrink-to-fit=no')

  const viewport = document.createElement('meta')
  viewport.setAttribute('name', 'viewport')
  viewport.setAttribute('id', 'metaViewport')
  viewport.setAttribute('content', attributes.join(', '))

  document.head.appendChild(viewport)
  await delay(16)
}

export const getRealScreenMaxSize = () => Math.max(getRealScreenWidth(), getRealScreenHeight())

const getRealPxScale = () => {
  const w = getRealScreenWidth()
  return round(w / window.innerWidth, 2)
}

const initViewportTryPixelPerfect = async () => {
  if (Params.isDesktop) {
    Params.set('viewportScale', 1)
    Params.set('pxScale', Params.pixelRatio)
    await setViewport()
  } else {
    Params.set('viewportScale', 1 / Params.pixelRatio)
    await setViewport()

    Params.set('pxScale', getRealPxScale())

    if (Params.pxScale / Params.pixelRatio !== Params.viewportScale) {
      Params.set('viewportScale', 1)
      Params.set('pxScale', Params.pixelRatio)
      await setViewport()
    }
  }

  Params.set('width', round(window?.visualViewport?.width || window.innerWidth, 0))
  Params.set('height', round(window?.visualViewport?.height || window.innerHeight, 0))
}

const openFolder = (e: Event) => {
  preventDefault(e)
  closeMainMenu()
  openPageFolder()
}

const openDashboard = (e: Event) => {
  preventDefault(e)
  closeMainMenu()
  openPageDashboard()
}

const openAboutUs = (e: Event) => {
  preventDefault(e)
  closeMainMenu()
  openPageAboutUs()
}

const initDom = async () => {
  const dom = await loadTemplate(tplApp, {
    labels,
  })
  const mainContainer = (Array.isArray(dom) ? dom[0] : dom) as HTMLElement
  refs.mainContainer = mainContainer
  refs.pagesContainer = mainContainer.querySelector('.drawith__pages-container')
  mainContainer
    .querySelector('.drawith__menu-pages-placeholder')
    ?.addEventListener(Params.eventStart, preventDefault)
  mainContainer
    .querySelector('.drawith__menu-item-folder')
    ?.addEventListener(Params.eventStart, openFolder)
  mainContainer
    .querySelector('.drawith__menu-item-dashboard')
    ?.addEventListener(Params.eventStart, openDashboard)
  mainContainer
    .querySelector('.drawith__menu-item-about')
    ?.addEventListener(Params.eventStart, openAboutUs)
  mainContainer
    .querySelector('.drawith__menu-pages-clear')
    ?.addEventListener(Params.eventStart, preventDefault)

  if (Params.ipad && refs.pagesContainer) {
    refs.pagesContainer.addEventListener(
      Params.eventStart,
      (e) => {
        preventMoveDefaultIfNeeded(e)
      },
      false
    )
  }

  document.body.appendChild(mainContainer)
  Params.set('mainContainer', mainContainer)
  Params.set('pagesContainer', refs.pagesContainer)
  attachRotationHandler()
}

export const init = securizeAsyncFn(
  async (props: Record<string, any> = {}) => {
    mergeObject(AppState, props)
    cleanEventsForNextRefresh()
    initPolyfills()
    Params.init(AppState)
    await initViewportTryPixelPerfect()
    initTheme()
    await initDom()
    await initHeader()
    handleGlobalResize()

    if (await isSupportedOs()) {
      setSpinner(true)
      await Messages.init()
      ;(window as any).Messages = Messages
      const dbInit = await initLocalDb()
      if (dbInit) {
        initDomUtils()
        initImageUtils()
        addEnviromentGlobalStatus()
        await initCoworking()
        await openCurrentUrlPage()
      } else {
        await openPageNotSupported()
      }
    } else {
      await openPageNotSupported()
    }
  },
  labels.genericError,
  'main.init',
  false
)

if (typeof document !== 'undefined') {
  if (document.readyState === 'complete') {
    init()
  } else {
    document.onreadystatechange = async () => {
      if (document.readyState === 'complete') {
        await init()
      }
    }
  }
}
