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
import { PageModule, registerNavigator } from 'app/navigation'
import { notifyMenuRouteChanged } from 'app/shellState'
import { initialRouteFromLocation } from 'modules/initialRoute'
import { iosVersionToCheck, scoreOsVersion } from 'modules/iosVersion'

const DEFAULT_ERROR_MSG = 'Routing error: refresh the page.'

const PAGES: Record<string, PageModule> = {
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

const getCurrentPage = () => currentRoute

const goToPage = securizeAsyncFn(
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
      notifyMenuRouteChanged(page)

      if (previousRoute !== page || force) {
        if (previousRoute && PAGES[previousRoute]?.close) {
          await PAGES[previousRoute].close!()
        }

        if (method === 'open') {
          const openFn = module.open as ((...args: any[]) => Promise<void> | void) | undefined
          await openFn?.(...params)
        } else if (module.open) {
          await module.open()
        }
      }

      if (method && method !== 'open' && typeof module[method] === 'function') {
        const actionFn = module[method] as (...args: any[]) => Promise<void> | void
        await actionFn(...params)
      }
    }

    routingQueue = routingQueue.then(runTransition, runTransition)
    await routingQueue
  },
  DEFAULT_ERROR_MSG,
  'goToPage'
)

registerNavigator(goToPage, getCurrentPage)

export const openCurrentUrlPage = async () => {
  const nextPage = initialRouteFromLocation(
    document.location.pathname,
    document.location.search,
    new Set(Object.keys(PAGES))
  )
  await goToPage(nextPage, nextPage !== `/${DEFAULT_PAGE}`)
}

export const isSupportedOs = async () => {
  if (isIOS) {
    const parsedOs = scoreOsVersion(iosVersionToCheck(osVersion, browserVersion))
    const minVersion = scoreOsVersion(notSupportedConfig.ios.minVersion)
    if (notSupportedConfig.ios.supported && (parsedOs === 0 || parsedOs >= minVersion)) {
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
