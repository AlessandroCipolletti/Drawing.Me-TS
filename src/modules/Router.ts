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
import * as Coworking from 'modules/Coworking'
import { PageModule, registerNavigator } from 'app/navigation'
import { notifyMenuRouteChanged } from 'app/shellState'
import { initialRouteFromLocation } from 'modules/initialRoute'
import { iosVersionToCheck, scoreOsVersion } from 'modules/iosVersion'

const DEFAULT_ERROR_MSG = 'Routing error: refresh the page.'

const PAGE_LOADERS: Record<string, () => Promise<PageModule>> = {
  editor: () => import('pages/Editor'),
  folder: () => import('pages/Folder'),
  dashboard: () => import('pages/Dashboard'),
  coworking: () => Promise.resolve(Coworking),
  notsupported: () => import('pages/NotSupported'),
  info: () => import('pages/Info'),
}
const DEFAULT_PAGE = 'folder'
const pageLoads = new Map<string, Promise<PageModule>>()

const loadPage = (page: string): Promise<PageModule> => {
  let pending = pageLoads.get(page)
  if (!pending) {
    pending = PAGE_LOADERS[page]()
    pageLoads.set(page, pending)
  }
  return pending
}

const prefetchEditor = () => {
  if (pageLoads.has('editor')) return
  const run = () => {
    void loadPage('editor')
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run)
  } else {
    setTimeout(run, 400)
  }
}

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
    let params: any[] = parts.slice(2)

    if (!PAGE_LOADERS[page]) {
      page = DEFAULT_PAGE
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
      const module = await loadPage(page)
      currentRoute = page
      notifyMenuRouteChanged(page)

      if (previousRoute !== page || force) {
        if (previousRoute) {
          const previousModule = await pageLoads.get(previousRoute)
          await previousModule?.close?.()
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

      if (page !== 'editor' && page !== 'notsupported') {
        prefetchEditor()
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
    new Set(Object.keys(PAGE_LOADERS))
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
