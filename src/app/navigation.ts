export interface PageModule {
  open?: (...args: never[]) => Promise<void> | void
  close?: () => Promise<void> | void
  [key: string]: unknown
}

export type NavigationOptions = boolean | Record<string, unknown>

type NavigateFn = (path?: string, forceOrOptions?: NavigationOptions) => Promise<unknown>
type CurrentPageGetter = () => string

let navigateDelegate: NavigateFn | null = null
let currentPageDelegate: CurrentPageGetter = () => ''

export const registerNavigator = (navigate: NavigateFn, getCurrent: CurrentPageGetter) => {
  navigateDelegate = navigate
  currentPageDelegate = getCurrent
}

export const goToPage = async (path = '', forceOrOptions: NavigationOptions = false) => {
  if (!navigateDelegate) return
  return await navigateDelegate(path, forceOrOptions)
}

export const getCurrentPage = (): string => currentPageDelegate()

export const openPageNotSupported = async () => await goToPage('/notsupported')

export const openPageDashboard = async () => await goToPage('/dashboard')

export const openPageAboutUs = async () => await goToPage('/info/aboutUs')

export const openPageFolder = async () => await goToPage('/folder')
