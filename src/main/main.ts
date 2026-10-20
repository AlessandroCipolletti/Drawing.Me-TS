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
import { init as initHeader } from 'components/Header'
import initDomUtils, {
  preventDefault,
  setSpinner,
  preventMoveDefaultIfNeeded,
} from 'utils/domUtils'
import { isSupportedOs, openCurrentUrlPage } from 'modules/Router'
import {
  openPageNotSupported,
  openPageFolder,
  openPageDashboard,
  openPageAboutUs,
} from 'app/navigation'
import { closeMainMenu, registerMenuRouteSubscriber } from 'app/shellState'
import {
  getRealScreenWidth,
  cleanEventsForNextRefresh,
  mergeObject,
  handleGlobalResize,
  addGlobalStatus,
} from 'utils/moduleUtils'
import { mount } from 'ui/mount'
import { AppShellView, AppShellRefs } from './AppShellView'

const AppState = {
  NAME: 'Drawith.Me',
  VERSION: '2.6.0',
  DEBUG: true,
}

const refs: AppShellRefs = {
  mainContainer: null,
  pagesContainer: null,
  menuPlaceholder: null,
  menuItemFolder: null,
  menuItemDashboard: null,
  menuItemAbout: null,
  menuPagesClear: null,
}

const labels = {
  folderPageLabel: 'My drawings',
  dashboardPageLabel: 'World GPS sheet',
  aboutUs: 'About Drawith.Me',
  genericError: 'Generic Error',
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
  const mainContainer = mount(document.body, AppShellView({ labels, refs }))
  refs.mainContainer = mainContainer

  refs.menuPlaceholder?.addEventListener(Params.eventStart, preventDefault)
  refs.menuItemFolder?.addEventListener(Params.eventStart, openFolder)
  refs.menuItemDashboard?.addEventListener(Params.eventStart, openDashboard)
  refs.menuItemAbout?.addEventListener(Params.eventStart, openAboutUs)
  refs.menuPagesClear?.addEventListener(Params.eventStart, preventDefault)

  registerMenuRouteSubscriber((route) => {
    refs.menuItemFolder?.classList.toggle('selected', route === 'folder')
    refs.menuItemDashboard?.classList.toggle('selected', route === 'dashboard')
    refs.menuItemAbout?.classList.toggle('selected', route === 'info')
  })

  if (Params.ipad && refs.pagesContainer) {
    refs.pagesContainer.addEventListener(
      Params.eventStart,
      (e) => {
        preventMoveDefaultIfNeeded(e)
      },
      false
    )
  }

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
