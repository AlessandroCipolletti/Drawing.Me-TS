import tplPage from './tpl/folder.tpl?raw'
import tplContent from './tpl/folderContent.tpl?raw'
import tplSharePopup from './tpl/folderSharePopup.tpl?raw'
import './tpl/folder.css'
import './tpl/folderContent.css'
import './tpl/folderSharePopup.css'

import Params from 'main/Params'
import * as Messages from 'modules/Messages'
import * as LocalDB from 'utils/localDbUtils'
import {
  removeSpinnerOverlayFrom,
  addSpinnerOverlayTo,
  setSpinner,
  loadTemplate,
  preventDefault,
  enableElements,
  disableElements,
} from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { addGlobalStatus, removeGlobalStatus, cleanRefs } from 'utils/moduleUtils'
import { shareImageWithBase64 } from 'utils/imageUtils'
import { deepCopy, copyTextToClipboard } from 'utils/jsUtils'
import { addListScrollClickAndPressHandlers } from 'utils/uiUtils'

import { goToPage } from 'modules/Router'
import * as Coworking from 'modules/Coworking'

const config = {
  updateDrawingsLoadingDelay: 1000, // ms
}
let state: Record<string, any> = {}
const initialState = {
  checkDrawingsInterval: false as any,
  loadingDrawingsIds: [] as number[],
  selectionMode: false,
  coworkingPopupOpened: false,
  sendCheckboxChecked: false,
}
const refs: {
  container: HTMLElement | null
  drawingsContainer: HTMLElement | null
  selectButton: HTMLElement | null
  doneButton: HTMLElement | null
  exportButton: HTMLElement | null
  deleteButton: HTMLElement | null
  sendButton: HTMLElement | null
  topnav: HTMLElement | null
  coworkingPopup: HTMLElement | null
  coworkingId: HTMLElement | null
  copyCoworkingUrlButton: HTMLElement | null
  copiedCoworkingLabel: HTMLElement | null
} = {
  container: null,
  drawingsContainer: null,
  selectButton: null,
  doneButton: null,
  exportButton: null,
  deleteButton: null,
  sendButton: null,
  topnav: null,
  coworkingPopup: null,
  coworkingId: null,
  copyCoworkingUrlButton: null,
  copiedCoworkingLabel: null,
}
const labels = {
  select: 'Select',
  done: 'Done',
  offline: 'OFFLINE',
  areYouSure: 'Are you sure?',
  tapAndHoldOneImage: 'Tap and hold the image to share it',
  tapAndHoldImages: 'Tap and hold an image to share it',
  withWhiteBackground: 'With white background',
  withoutBackground: 'With no background',
  newDrawing: 'Draw alone',
  drawWithAFriend: 'Draw with a friend',
  navbarTitle: 'YOUR DRAWINGS',
  tapToShare: '^ Double tap to share ^',
  copied: 'Copied!',
  coworkingPopupTitle: 'Send this url to a friend to start drawing together',
  coworkingPopupIstructions1: 'Each unique url works for one session only.',
  coworkingPopupIstructions2: 'Do not reload the page until your friend has connected.',
  waitingToReconnect: 'Waiting for connections...',
}

let toolsButtons: HTMLElement[] = []

const createNewDrawing = (e: Event) => {
  preventDefault(e)
  setSpinner(true)
  goToPage('editor/open/')
}

const openDrawing = async (drawingId: string | number | null) => {
  if (!drawingId) return
  setSpinner(true)
  goToPage(`editor/open/${drawingId}`)
}

const copyCoworkingUrl = (() => {
  let lastTapTimestamp = 0
  const doubleTapDelay = 250
  return () => {
    if (!refs.coworkingId) return
    copyTextToClipboard(refs.coworkingId.innerHTML)
    const now = Date.now()
    if (Params.isDesktop || now - lastTapTimestamp < doubleTapDelay) {
      refs.copyCoworkingUrlButton?.classList.add('displayNone')
      refs.copiedCoworkingLabel?.classList.remove('displayNone')
    }
    lastTapTimestamp = now
  }
})()

const shareCoworkingUrl = (e: Event) => {
  preventDefault(e)
  copyCoworkingUrl()
  if (!Params.isDesktop && navigator.share && refs.coworkingId) {
    navigator.share({
      title: "Let's draw together on Drawith.me",
      url: refs.coworkingId.innerHTML,
    })
  }
}

const onCloseCoworkingPopup = () => {
  state.coworkingPopupOpened = false
}

export const closeCoworkingPopup = () => {
  if (state.coworkingPopupOpened && refs.coworkingPopup) {
    onCloseCoworkingPopup()
    Messages.panel(refs.coworkingPopup)
  }
}

const openCoworkingPopup = (e: Event) => {
  preventDefault(e)
  if (Coworking.isOnline() && refs.coworkingId && refs.coworkingPopup) {
    state.coworkingPopupOpened = true
    refs.coworkingId.innerHTML = `${document.location.origin}${document.location.pathname}?S=${Coworking.getSocketId()}`
    Messages.panel(refs.coworkingPopup, {
      onClose: onCloseCoworkingPopup,
    })
    refs.copyCoworkingUrlButton?.classList.remove('displayNone')
    refs.copiedCoworkingLabel?.classList.add('displayNone')
  }
}

const onDrawingClick = (e: any) => {
  const target = e.target as HTMLElement
  if (
    target.classList.contains('folder__drawing') ||
    target.classList.contains('folder__drawing-preview')
  ) {
    let touchedDrawing = target
    if (target.classList.contains('folder__drawing-preview')) {
      touchedDrawing = target.parentNode as HTMLElement
    }
    if (state.selectionMode) {
      if (!touchedDrawing.classList.contains('folder__drawing-new-drawing')) {
        touchedDrawing.classList.toggle('folder__drawing-selected')
        updateTopnavButtons()
      }
    } else {
      openDrawing(touchedDrawing.getAttribute('data-local-id'))
    }
  }
}

const onDrawingLongPress = (e: any) => {
  onDrawingClick(e)
}

const updateTopnavButtons = () => {
  if (refs.drawingsContainer?.querySelectorAll('.folder__drawing-selected').length) {
    enableElements(toolsButtons)
  } else {
    disableElements(toolsButtons)
  }
}

const onTopnavTouchStart = (e: Event) => {
  preventDefault(e)
  if (e.target === refs.selectButton) {
    selectButtonClick()
  } else if (e.target === refs.doneButton) {
    doneButtonClick()
  } else if (e.target === refs.exportButton) {
    exportButtonClick()
  } else if (e.target === refs.deleteButton) {
    deleteButtonClick()
  }
}

const selectButtonClick = () => {
  if (
    !refs.selectButton ||
    refs.selectButton.classList.contains('disabled') ||
    refs.selectButton.classList.contains('displayNone')
  ) {
    return
  }
  state.selectionMode = true
  addGlobalStatus('drawith__FOLDER-SELECT-MODE')
  refs.selectButton.classList.add('disabled', 'displayNone')
  refs.doneButton?.classList.remove('disabled', 'displayNone')
}

const doneButtonClick = () => {
  if (
    !refs.doneButton ||
    refs.doneButton.classList.contains('disabled') ||
    refs.doneButton.classList.contains('displayNone')
  ) {
    return
  }
  state.selectionMode = false
  removeGlobalStatus('drawith__FOLDER-SELECT-MODE')
  refs.doneButton.classList.add('disabled', 'displayNone')
  refs.selectButton?.classList.remove('disabled', 'displayNone')
  deselectAll()
}

const exportButtonClick = async () => {
  if (!refs.exportButton || refs.exportButton.classList.contains('disabled')) {
    return
  }
  setSpinner(true)
  const selectedDrawings: any[] = await Promise.all(getSelectedIds().map(LocalDB.getOneDrawing))

  const bitmaps = selectedDrawings.filter(Boolean).map((d) => d.bitmap)
  const drawings = await Promise.all(
    bitmaps.map(async (drawing) => ({
      w: await shareImageWithBase64(drawing, true), // white bg
      t: await shareImageWithBase64(drawing, false), // transparent bg
    }))
  )
  const dom = await loadTemplate(tplSharePopup, {
    drawings,
    subtitleLabel: drawings.length === 1 ? labels.tapAndHoldOneImage : labels.tapAndHoldImages,
    withoutBackgroundLabel: labels.withoutBackground,
    withBackgroundLabel: labels.withWhiteBackground,
  })
  const popupContent = Array.isArray(dom) ? dom[0] : dom
  popupContent.addEventListener('gesturestart', preventDefault)

  setSpinner(false)
  Messages.panel(popupContent, {})
}

const deleteButtonClick = async () => {
  if (!refs.deleteButton || refs.deleteButton.classList.contains('disabled')) {
    return
  }
  if (await Messages.confirm(labels.areYouSure)) {
    deleteSelectedDrawings()
  }
}

const deleteSelectedDrawings = async () => {
  setSpinner(true)
  const currentIds = getSelectedIds()
  disableElements(toolsButtons)
  await LocalDB.deleteLocalDrawings(currentIds)
  await refreshContent()
  doneButtonClick()
  setSpinner(false)
}

const deselectAll = () => {
  if (!refs.drawingsContainer) return
  const selected = refs.drawingsContainer.querySelectorAll('.folder__drawing-selected')
  for (let i = selected.length; i--;) {
    selected[i].classList.remove('folder__drawing-selected')
  }
  disableElements(toolsButtons)
}

const getSelectedIds = (): number[] => {
  if (!refs.drawingsContainer) return []
  return [...refs.drawingsContainer.querySelectorAll('.folder__drawing-selected')].map((el) =>
    parseInt(el.getAttribute('data-local-id') || '0', 10)
  )
}

const applySavingSpinnerState = (drawing: any) => {
  if (!drawing) return
  const drawingDom = document.querySelector(
    `.folder__drawing[data-local-id="${drawing.localDbId}"]`
  ) as HTMLElement | null
  if (!drawingDom) return
  const isSaving = LocalDB.drawingIsSaving(drawing)
  if (isSaving) {
    if (!drawingDom.classList.contains('folder__drawing-saving')) {
      drawingDom.classList.add('folder__drawing-saving')
      addSpinnerOverlayTo(drawingDom, false)
    }
  } else if (drawingDom.classList.contains('folder__drawing-saving')) {
    drawingDom.classList.remove('folder__drawing-saving')
    removeSpinnerOverlayFrom(drawingDom)
  }
  drawingDom.classList.toggle('folder__drawing-saving', isSaving)
}

export const updateDrawingsLoading = async () => {
  if (!state.loadingDrawingsIds || state.loadingDrawingsIds.length === 0) {
    clearInterval(state.checkDrawingsInterval)
    return
  }
  const drawings = ((await LocalDB.getSomeDrawings(state.loadingDrawingsIds)) || []) as any[]
  for (const drawing of drawings) {
    if (drawing) {
      applySavingSpinnerState(drawing)
    }
  }

  state.loadingDrawingsIds = drawings
    .filter((d: any) => d && LocalDB.drawingIsSaving(d))
    .map((d: any) => d.localDbId)
  if (state.loadingDrawingsIds.length === 0) {
    clearInterval(state.checkDrawingsInterval)
  }
}

export const refreshContent = async () => {
  if (!refs.drawingsContainer || !refs.topnav) return
  const drawings: any[] = (await LocalDB.getAllLocalDrawings()) || []
  const currentScroll = refs.drawingsContainer.scrollTop
  refs.drawingsContainer.innerHTML = ''
  await loadTemplate(tplContent, { drawings }, refs.drawingsContainer)
  refs.drawingsContainer.scrollTop = currentScroll
  refs.topnav.classList.toggle('displayNone', !drawings.length)

  // Fix legacy two-phase spinner flicker:
  // Apply the card spinner synchronously right after rendering `tplContent` using
  // the `drawings` we already loaded, so there is zero frame gap when Folder opens!
  state.loadingDrawingsIds = drawings.filter(LocalDB.drawingIsSaving).map((d) => d.localDbId)
  if (state.loadingDrawingsIds.length > 0) {
    for (const drawing of drawings) {
      if (LocalDB.drawingIsSaving(drawing)) {
        applySavingSpinnerState(drawing)
      }
    }
    clearInterval(state.checkDrawingsInterval)
    state.checkDrawingsInterval = setInterval(
      updateDrawingsLoading,
      config.updateDrawingsLoadingDelay
    )
  }
}

const initDom = async () => {
  const dom = await loadTemplate(
    tplPage,
    {
      labels,
    },
    Params.pagesContainer
  )
  const container = (Array.isArray(dom) ? dom[0] : dom) as HTMLElement
  refs.container = container
  refs.selectButton = container.querySelector('.folder__topbar-button-select')
  refs.doneButton = container.querySelector('.folder__topbar-button-done')
  refs.exportButton = container.querySelector('.folder__topbar-button-export')
  refs.deleteButton = container.querySelector('.folder__topbar-button-delete')
  refs.topnav = container.querySelector('.folder__topbar')
  refs.drawingsContainer = container.querySelector('.folder__drawings-container')
  refs.coworkingPopup = container.querySelector('.folder__coworking-popup')
  refs.coworkingId = refs.coworkingPopup!.querySelector('.folder__coworking-popup-id')
  refs.copyCoworkingUrlButton = refs.coworkingPopup!.querySelector('.folder__coworking-popup-copy')
  refs.copiedCoworkingLabel = refs.coworkingPopup!.querySelector('.folder__coworking-popup-copied')
  refs.topnav!.addEventListener(Params.eventStart, onTopnavTouchStart, true)
  refs.coworkingId!.addEventListener(Params.eventStart, shareCoworkingUrl)
  refs.copyCoworkingUrlButton!.addEventListener(Params.eventStart, shareCoworkingUrl)
  refs
    .coworkingPopup!.querySelector('.folder__coworking-copy-icon')!
    .addEventListener(Params.eventStart, shareCoworkingUrl)
  refs.coworkingPopup!.addEventListener(Params.eventStart, preventDefault)
  container
    .querySelector('.folder__drawing-new-drawing')!
    .addEventListener(Params.eventStart, createNewDrawing)
  container
    .querySelector('.folder__drawing-new-coworking')!
    .addEventListener(Params.eventStart, openCoworkingPopup)
  container
    .querySelector('.folder__new-container')!
    .addEventListener(Params.eventStart, preventDefault)
  refs.coworkingPopup!.remove()
  addListScrollClickAndPressHandlers(refs.drawingsContainer!, onDrawingClick, onDrawingLongPress)
  toolsButtons.push(refs.exportButton!, refs.deleteButton!)
}

export const open = async () => {
  state = deepCopy(initialState)
  await initDom()
  setSpinner(true)
  await refreshContent()
  setSpinner(false)
  addGlobalStatus('drawith__FOLDER-OPEN')
  if (refs.container) fadeInElements(refs.container)
  await Coworking.completePendingCoworkerJoinIfNeeded()
}

export const close = async () => {
  if (refs.container) await fadeOutElements(refs.container)
  removeGlobalStatus('drawith__FOLDER-OPEN')
  closeCoworkingPopup()
  clearInterval(state.checkDrawingsInterval)
  toolsButtons = []
  state = {}
  cleanRefs(refs)
}
