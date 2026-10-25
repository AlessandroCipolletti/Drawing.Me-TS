import './info.css'

import Params from 'main/Params'
import { cleanRefs } from 'utils/moduleUtils'
import { preventDefault } from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { openPageAboutUs } from 'app/navigation'
import { deselectAllTabs, selectOneTab } from 'utils/uiUtils'
import { mount, createListenerScope, ListenerScope } from 'ui/mount'
import { InfoView } from './InfoView'

const refs: {
  container: HTMLElement | null
} = {
  container: null,
}
const labels = {
  createdBy: 'Created by',
  version: 'Version',
  aboutUs: 'About us',
}

let scope: ListenerScope | null = null

const initDom = async () => {
  scope?.dispose()
  scope = createListenerScope()

  let aboutTabEl: HTMLElement | null = null
  const container = mount(
    Params.pagesContainer,
    InfoView({
      labels,
      version: Params.appVersion,
      onAboutTabRef: (el) => {
        aboutTabEl = el
      },
    })
  )
  refs.container = container

  scope.on(container, 'gesturestart', preventDefault)
  scope.on(aboutTabEl, Params.eventStart, openPageAboutUs)
}

export const aboutUs = () => {
  if (!refs.container) return
  deselectAllTabs(refs.container)
  selectOneTab(refs.container, 'about-us')
}

export const open = async () => {
  await initDom()
  aboutUs()
  if (refs.container) fadeInElements(refs.container)
}

export const close = async () => {
  scope?.dispose()
  scope = null
  if (refs.container) await fadeOutElements(refs.container)
  cleanRefs(refs)
}
