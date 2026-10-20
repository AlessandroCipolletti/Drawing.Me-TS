import tplPage from './info.tpl?raw'
import './info.css'

import Params from 'main/Params'
import { cleanRefs } from 'utils/moduleUtils'
import { loadTemplate, preventDefault } from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { openPageAboutUs } from 'modules/Router'
import { deselectAllTabs, selectOneTab } from 'utils/uiUtils'

const refs: {
  container: HTMLElement | null
} = {
  container: null,
}
const labels = {
  createdBy: 'Created by',
  version: 'Version',
  and: 'and',
  aboutUs: 'About us',
}

const initDom = async () => {
  const dom = await loadTemplate(
    tplPage,
    {
      labels,
      version: Params.appVersion,
    },
    Params.pagesContainer
  )
  const container = (Array.isArray(dom) ? dom[0] : dom) as HTMLElement
  refs.container = container

  container.addEventListener('gesturestart', preventDefault)
  container
    .querySelector('.tabs-header div[data-tab-id="about-us"]')
    ?.addEventListener(Params.eventStart, openPageAboutUs)
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
  if (refs.container) await fadeOutElements(refs.container)
  cleanRefs(refs)
}
