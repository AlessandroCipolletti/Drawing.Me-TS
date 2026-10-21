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
  preventDefault,
  enableElements,
  disableElements,
} from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { addGlobalStatus, removeGlobalStatus, cleanRefs } from 'utils/moduleUtils'
import { shareImageWithBase64 } from 'utils/imageUtils'
import { deepCopy, copyTextToClipboard } from 'utils/jsUtils'
import { addListScrollClickAndPressHandlers } from 'utils/uiUtils'
import { mount } from 'ui/mount'
import { goToPage } from 'app/navigation'
import { onCoworkingEvent } from 'app/coworkingBus'
import * as Coworking from 'modules/Coworking'
import {
  FolderView,
  FolderDrawingsListView,
  FolderSharePopupView,
  FolderRefs,
  FolderLabels,
} from './FolderView'

const config = {
  updateDrawingsLoadingDelay: 1000,
}

interface FolderState {
  checkDrawingsInterval: ReturnType<typeof setInterval> | false
  loadingDrawingsIds: number[]
  selectionMode: boolean
  coworkingPopupOpened: boolean
  sendCheckboxChecked: boolean
}

const initialState: FolderState = {
  checkDrawingsInterval: false,
  loadingDrawingsIds: [],
  selectionMode: false,
  coworkingPopupOpened: false,
  sendCheckboxChecked: false,
}

let state: FolderState = deepCopy(initialState)

const refs: FolderRefs = {
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
  coworkingCopyIcon: null,
  newDrawingButton: null,
  newCoworkingButton: null,
  newContainer: null,
}

const labels: FolderLabels = {
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
  navbarTitle: 'YOUR DRAWINGS - 2',
  tapToShare: '^ Double tap to share ^',
  copied: 'Copied!',
  coworkingPopupTitle: 'Send this url to a friend to start drawing together',
  coworkingPopupIstructions1: 'Each unique url works for one session only.',
  coworkingPopupIstructions2: 'Do not reload the page until your friend has connected.',
  waitingToReconnect: 'Waiting for connections...',
}

let toolsButtons: HTMLElement[] = []
let unsubscribeCoworkingPopup: (() => void) | null = null
let unsubscribeDrawingsLoading: (() => void) | null = null

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

const closeCoworkingPopup = () => {
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
      w: await shareImageWithBase64(drawing, true),
      t: await shareImageWithBase64(drawing, false),
    }))
  )
  const popupContent = FolderSharePopupView({
    drawings,
    subtitleLabel: drawings.length === 1 ? labels.tapAndHoldOneImage : labels.tapAndHoldImages,
    withoutBackgroundLabel: labels.withoutBackground,
    withBackgroundLabel: labels.withWhiteBackground,
  })
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

const updateDrawingsLoading = async () => {
  if (!state.loadingDrawingsIds || state.loadingDrawingsIds.length === 0) {
    if (state.checkDrawingsInterval) clearInterval(state.checkDrawingsInterval)
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
  if (state.loadingDrawingsIds.length === 0 && state.checkDrawingsInterval) {
    clearInterval(state.checkDrawingsInterval)
  }
}

export const refreshContent = async () => {
  if (!refs.drawingsContainer || !refs.topnav) return
  const drawings: any[] = (await LocalDB.getAllLocalDrawings()) || []
  const currentScroll = refs.drawingsContainer.scrollTop
  refs.drawingsContainer.innerHTML = ''
  mount(refs.drawingsContainer, FolderDrawingsListView({ drawings }))
  refs.drawingsContainer.scrollTop = currentScroll
  refs.topnav.classList.toggle('displayNone', !drawings.length)

  state.loadingDrawingsIds = drawings.filter(LocalDB.drawingIsSaving).map((d) => d.localDbId)
  if (state.loadingDrawingsIds.length > 0) {
    for (const drawing of drawings) {
      if (LocalDB.drawingIsSaving(drawing)) {
        applySavingSpinnerState(drawing)
      }
    }
    if (state.checkDrawingsInterval) clearInterval(state.checkDrawingsInterval)
    state.checkDrawingsInterval = setInterval(
      updateDrawingsLoading,
      config.updateDrawingsLoadingDelay
    )
  }
}

const initDom = async () => {
  mount(Params.pagesContainer, FolderView({ labels, refs }))

  refs.topnav?.addEventListener(Params.eventStart, onTopnavTouchStart, true)
  refs.coworkingId?.addEventListener(Params.eventStart, shareCoworkingUrl)
  refs.copyCoworkingUrlButton?.addEventListener(Params.eventStart, shareCoworkingUrl)
  refs.coworkingCopyIcon?.addEventListener(Params.eventStart, shareCoworkingUrl)
  refs.coworkingPopup?.addEventListener(Params.eventStart, preventDefault)
  refs.newDrawingButton?.addEventListener(Params.eventStart, createNewDrawing)
  refs.newCoworkingButton?.addEventListener(Params.eventStart, openCoworkingPopup)
  refs.newContainer?.addEventListener(Params.eventStart, preventDefault)
  refs.coworkingPopup?.remove()
  if (refs.drawingsContainer) {
    addListScrollClickAndPressHandlers(refs.drawingsContainer, onDrawingClick, onDrawingLongPress)
  }
  if (refs.exportButton && refs.deleteButton) {
    toolsButtons.push(refs.exportButton, refs.deleteButton)
  }
}

export const open = async () => {
  state = deepCopy(initialState)
  await initDom()
  unsubscribeCoworkingPopup = onCoworkingEvent('closeFolderPopup', closeCoworkingPopup)
  unsubscribeDrawingsLoading = onCoworkingEvent('updateFolderDrawingsLoading', () => {
    void updateDrawingsLoading()
  })
  setSpinner(true)
  await refreshContent()
  setSpinner(false)
  addGlobalStatus('drawith__FOLDER-OPEN')
  if (refs.container) fadeInElements(refs.container)
  await Coworking.completePendingCoworkerJoinIfNeeded()
}

export const close = async () => {
  unsubscribeCoworkingPopup?.()
  unsubscribeCoworkingPopup = null
  unsubscribeDrawingsLoading?.()
  unsubscribeDrawingsLoading = null
  if (refs.container) await fadeOutElements(refs.container)
  removeGlobalStatus('drawith__FOLDER-OPEN')
  closeCoworkingPopup()
  if (state.checkDrawingsInterval) clearInterval(state.checkDrawingsInterval)
  toolsButtons = []
  state = deepCopy(initialState)
  cleanRefs(refs)
}
