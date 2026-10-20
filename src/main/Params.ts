import {
  isAndroid,
  osName,
  isMobileOnly,
  isMobile,
  isTablet,
  isBrowser,
  isIOS,
  isMacOs,
  isIPad13,
  browserName,
} from 'mobile-device-detect'
import { getRealScreenWidth, getRealScreenHeight } from 'utils/moduleUtils'

interface AppInitState {
  NAME: string
  VERSION: string
  DEBUG: boolean
}

interface ParamsObject {
  [key: string]: any
  appName: string
  appVersion: string
  isInstalledWebapp: boolean
  isLocal: boolean
  isDevEnv: boolean
  isProdEnv: boolean
  debugMode: boolean
  supportTouch: boolean
  eventStart: string
  eventMove: string
  eventEnd: string
  eventOut: string
  eventCanceled: string
  eventScroll: string
  eventPageVisibilityChange: string
  android: boolean
  isMacOs: boolean
  osName: string
  ipad: boolean
  iphone: boolean
  ios: boolean
  isTablet: boolean
  isPhone: boolean
  isMobile: boolean
  isDesktop: boolean
  isAppOnline: boolean
  deviceType: 'PHONE' | 'DESKTOP' | 'TABLET'
  pixelRatio: number
  viewportScale: number
  pxScale: number
  width: number
  height: number
  isHighPerformanceTablet: boolean
  isHighPerformanceDesktop: boolean
  deviceHasGoodPerformance: boolean
  peerServerHost: string
  peerServerPort: number
  peerServerPath: string
  peerPingInterval: number
  localDbName: string
  mainContainer: HTMLElement | null
  pagesContainer: HTMLElement | null
  init: (appState: AppInitState) => void
  set: (key: string, value: any) => void
}

const Params: ParamsObject = {
  appName: 'Drawith.Me',
  appVersion: '3.0.0',
  isInstalledWebapp: false,
  isLocal: true,
  isDevEnv: false,
  isProdEnv: false,
  debugMode: false,
  supportTouch: false,
  eventStart: 'pointerdown',
  eventMove: 'pointermove',
  eventEnd: 'pointerup',
  eventOut: 'pointerout',
  eventCanceled: 'pointercancel',
  eventScroll: 'wheel',
  eventPageVisibilityChange: 'visibilitychange',
  android: false,
  isMacOs: false,
  osName: '',
  ipad: false,
  iphone: false,
  ios: false,
  isTablet: false,
  isPhone: false,
  isMobile: false,
  isDesktop: true,
  isAppOnline: false,
  deviceType: 'DESKTOP',
  pixelRatio: 1,
  viewportScale: 1,
  pxScale: 1,
  width: 1024,
  height: 768,
  isHighPerformanceTablet: false,
  isHighPerformanceDesktop: true,
  deviceHasGoodPerformance: true,
  peerServerHost: '0.peerjs.com',
  peerServerPort: 443,
  peerServerPath: '/',
  peerPingInterval: 5000,
  localDbName: 'drawing_me_ts_DB',
  mainContainer: null,
  pagesContainer: null,

  init(appState: AppInitState) {
    Params.appName = appState.NAME
    Params.appVersion = appState.VERSION
    Params.isInstalledWebapp = !!(window.navigator as any).standalone
    Params.isLocal =
      document.location.hostname === 'localhost' ||
      document.location.hostname.includes('192.168') ||
      document.location.hostname === '127.0.0.1'
    Params.isDevEnv = document.location.hostname.includes('dev.drawith.me')
    Params.isProdEnv = document.location.hostname.includes('app.drawith.me')
    Params.debugMode = Params.isLocal && appState.DEBUG
    Params.supportTouch = 'ontouchstart' in window

    if (typeof window !== 'undefined' && 'PointerEvent' in window) {
      Params.eventStart = 'pointerdown'
      Params.eventMove = 'pointermove'
      Params.eventEnd = 'pointerup'
      Params.eventOut = 'pointerout'
      Params.eventCanceled = 'pointercancel'
    } else if (Params.supportTouch) {
      Params.eventStart = 'touchstart'
      Params.eventMove = 'touchmove'
      Params.eventEnd = 'touchend'
      Params.eventOut = ''
      Params.eventCanceled = 'touchcancel'
    } else {
      Params.eventStart = 'pointerdown'
      Params.eventMove = 'pointermove'
      Params.eventEnd = 'pointerup'
      Params.eventOut = 'pointerout'
      Params.eventCanceled = 'pointercancel'
    }
    Params.eventScroll = 'wheel'
    Params.eventPageVisibilityChange = 'visibilitychange'

    const userAgent = navigator.userAgent.toLowerCase()
    const isIpadOS =
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      (isMacOs && isTablet) ||
      /ipad/.test(userAgent)
    Params.android = isAndroid
    Params.isMacOs = isMacOs
    Params.osName = osName
    Params.ipad = isIpadOS
    Params.iphone = /iphone/.test(userAgent)
    Params.ios = isIOS || isIpadOS
    Params.isTablet = isTablet || isIpadOS
    Params.isPhone = isMobileOnly && !isIpadOS
    Params.isMobile = isMobile || isIpadOS
    Params.isDesktop = !Params.isTablet && !Params.isMobile && isBrowser
    Params.isAppOnline = document.location.host.toLowerCase() === Params.appName.toLowerCase()

    if (Params.ipad) {
      Params.osName = 'ipad os'
    }

    if (Params.isPhone) {
      Params.deviceType = 'PHONE'
    } else if (Params.isDesktop) {
      Params.deviceType = 'DESKTOP'
    } else {
      Params.deviceType = 'TABLET'
    }

    const pixelRatio = Math.round((window.devicePixelRatio || 1) * 100) / 100
    Params.pixelRatio = Params.isPhone ? 1 : pixelRatio

    Params.isHighPerformanceTablet =
      (isIPad13 || isIpadOS) && Math.max(getRealScreenWidth(), getRealScreenHeight()) > 2300
    Params.isHighPerformanceDesktop =
      Params.isDesktop &&
      (Params.isLocal || (browserName === 'Chrome' && navigator.hardwareConcurrency >= 8))
    Params.deviceHasGoodPerformance =
      Params.isHighPerformanceTablet || Params.isHighPerformanceDesktop

    Params.peerServerHost = '0.peerjs.com'
    Params.peerServerPort = 443
    Params.peerServerPath = '/'
    Params.peerPingInterval = 5000

    Params.localDbName = 'drawing_me_ts_DB'
  },

  set(key: string, value: any) {
    if (key !== 'set' && key !== 'init') {
      Params[key] = value
    }
  },
}

export default Params
