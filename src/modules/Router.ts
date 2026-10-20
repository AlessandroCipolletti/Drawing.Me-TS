import {
  osVersion,
  isSmartTV,
  browserName,
  isWearable,
  isAndroid,
  browserVersion,
  isIOS,
  isIE,
  isConsole,
  isWinPhone,
  isOpera,
} from 'mobile-device-detect'
import { securizeAsyncFn } from 'utils/jsUtils'
import { config as notSupportedConfig } from 'pages/NotSupported/config'
import * as NotSupported from 'pages/NotSupported'
import * as Dashboard from 'pages/Dashboard'
import * as Coworking from 'modules/Coworking'
import * as Editor from 'pages/Editor'
import * as Folder from 'pages/Folder'
import * as Info from 'pages/Info'

const DEFAULT_ERROR_MSG = 'Routing error: refresh the page.'

const PAGES: Record<string, any> = {
  editor: Editor,
  folder: Folder,
  dashboard: Dashboard,
  coworking: Coworking,
  notsupported: NotSupported,
  info: Info,
}
const DEFAULT_PAGE = 'folder'

let currentRoute = ''
let routingQueue: Promise<any> = Promise.resolve()

export const getCurrentPage = () => currentRoute

const decryptInitialPathUrl = (path: string, search: string): string => {
  const queryParams = new URLSearchParams(search)
  let url = path

  if (queryParams.get('S')) {
    url = `${url}/coworking/requestSession/${queryParams.get('S')}`.replace('//', '/')
  }

  if (url.endsWith('/editor') || url.endsWith('/editor/')) {
    url = url.replace('/editor', '/folder')
  }

  if (url.includes('/notSupported') || url.includes('/notsupported')) {
    url = '/folder'
  }

  return url
}

const selectMenuItem = (route: string) => {
  document.querySelector('.drawith__menu-item.selected')?.classList.remove('selected')
  if (route === 'folder') {
    document.querySelector('.drawith__menu-item-folder')?.classList.add('selected')
  } else if (route === 'dashboard') {
    document.querySelector('.drawith__menu-item-dashboard')?.classList.add('selected')
  } else if (route === 'info') {
    document.querySelector('.drawith__menu-item-about')?.classList.add('selected')
  }
}

export const goToPage = securizeAsyncFn(
  async (path = '', forceOrOptions: any = false) => {
    const force = typeof forceOrOptions === 'boolean' ? forceOrOptions : false
    const cleanPath = path.trim().replace(/^\?/, '')
    const parts = cleanPath.split('/').filter((e: string) => e !== '')
    let page = (parts[0] || DEFAULT_PAGE).toLowerCase()
    let method = parts[1] || ''
    let module = PAGES[page]
    let params: any[] = parts.slice(2)

    if (!module) {
      page = DEFAULT_PAGE
      module = PAGES[DEFAULT_PAGE]
      method = ''
      params = []
    }

    params = params.map((p) => {
      try {
        return JSON.parse(p)
      } catch (_) {
        return p
      }
    })

    if (
      typeof forceOrOptions === 'object' &&
      forceOrOptions !== null &&
      Object.keys(forceOrOptions).length > 0
    ) {
      params.push(forceOrOptions)
    }

    const runTransition = async () => {
      const previousRoute = currentRoute
      currentRoute = page
      selectMenuItem(page)

      if (previousRoute !== page || force) {
        if (previousRoute && PAGES[previousRoute]?.close) {
          await PAGES[previousRoute].close()
        }

        if (method === 'open') {
          await module.open(...params)
        } else if (module.open) {
          await module.open()
        }
      }

      if (method && method !== 'open' && typeof module[method] === 'function') {
        await module[method](...params)
      }
    }

    routingQueue = routingQueue.then(runTransition, runTransition)
    await routingQueue
  },
  DEFAULT_ERROR_MSG,
  'goToPage'
)

export const openCurrentUrlPage = async () => {
  const ROOT_URL = '/workspace/drawithme'
  const pathname = document.location.pathname.toLowerCase().replace(ROOT_URL, '')
  const nextPage = decryptInitialPathUrl(pathname, document.location.search)
  await goToPage(nextPage, nextPage !== `/${DEFAULT_PAGE}`)
}

export const openPageNotSupported = async () => await goToPage('/notsupported')

export const openPageDashboard = async () => await goToPage('/dashboard')

export const openPageAboutUs = async () => await goToPage('/info/aboutUs')

export const openPageFolder = async () => await goToPage('/folder')

const parseMobileDeviceDetectOSVersion = (version: string) =>
  String(version || '')
    .replace(/_/g, '.')
    .split('.')
    .reduce((tot, v, i) => tot + (parseInt(v, 10) || 0) * Math.pow(10, 4 - i * 2), 0)

export const isSupportedOs = async () => {
  if (isIOS) {
    const parsedOs = parseMobileDeviceDetectOSVersion(osVersion)
    if (
      notSupportedConfig.ios.supported &&
      (parsedOs === 0 ||
        parsedOs >= parseMobileDeviceDetectOSVersion(notSupportedConfig.ios.minVersion))
    ) {
      return true
    }
    return false
  } else if (isAndroid) {
    const parsedAndroidOs = parseInt(osVersion, 10)
    const parsedBrowserVer = parseInt(browserVersion, 10)
    if (
      notSupportedConfig.android.supported &&
      (Number.isNaN(parsedAndroidOs) || parsedAndroidOs >= notSupportedConfig.android.minVersion) &&
      browserName.toLowerCase().includes('chrome') &&
      (Number.isNaN(parsedBrowserVer) ||
        parsedBrowserVer >= notSupportedConfig.android.minBrowserVersion)
    ) {
      return true
    }
    return false
  } else if (isIE && !notSupportedConfig.ie.supported) {
    return false
  } else if (isSmartTV && !notSupportedConfig.smartTV.supported) {
    return false
  } else if (isWearable && !notSupportedConfig.wearable.supported) {
    return false
  } else if (isConsole && !notSupportedConfig.console.supported) {
    return false
  } else if (isWinPhone && !notSupportedConfig.windowsMobile.supported) {
    return false
  } else if (isOpera && !notSupportedConfig.opera.supported) {
    return false
  }
  return true
}
