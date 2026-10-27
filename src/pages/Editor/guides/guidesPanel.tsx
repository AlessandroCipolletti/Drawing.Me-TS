import './guidesPanel.css'
import Params from 'main/Params'
import { preventDefault } from 'utils/domUtils'
import { mount } from 'ui/mount'
import { h } from 'ui/jsx-runtime'
import { guidesState, setShowOriginHandle, setSymmetryMode } from './guidesState'
import { SYMMETRY_SECTOR_COUNTS, type SymmetryMode } from './guideTypes'
import { sendSceneGuidesIfCoworking } from './guidesCoworking'

interface GuidesPanelRefs {
  panel: HTMLElement | null
}

const refs: GuidesPanelRefs = {
  panel: null,
}

let onChange: (() => void) | null = null
let onToolbarSync: (() => void) | null = null
let bumpParamsInactivity: (() => void) | null = null
let canvasWidth = 1
let canvasHeight = 1

export const setGuidesPanelCanvasSize = (w: number, h: number) => {
  canvasWidth = w
  canvasHeight = h
}

export const setGuidesPanelChangeHandler = (fn: () => void) => {
  onChange = fn
}

export const setGuidesToolbarSyncHandler = (fn: () => void) => {
  onToolbarSync = fn
}

export const setGuidesParamsInactivityBumper = (fn: () => void) => {
  bumpParamsInactivity = fn
}

export const notifyGuidesPanelChange = () => {
  onChange?.()
  onToolbarSync?.()
  sendSceneGuidesIfCoworking(canvasWidth, canvasHeight)
}

const notify = () => {
  bumpParamsInactivity?.()
  notifyGuidesPanelChange()
}

export const syncGuidesPanelUi = () => {
  if (!refs.panel) return
  refs.panel.querySelectorAll('[data-symmetry]').forEach((el) => {
    el.classList.toggle(
      'editor-guides__chip--active',
      (el as HTMLElement).dataset.symmetry === guidesState.symmetry
    )
  })
  const handleBtn = refs.panel.querySelector('[data-origin-handle]') as HTMLElement | null
  handleBtn?.classList.toggle('editor-guides__chip--active', guidesState.showOriginHandle)
  handleBtn?.setAttribute(
    'aria-label',
    guidesState.showOriginHandle ? 'Hide mirror center handle' : 'Show mirror center handle'
  )
}

const GuidesPanelView = () => (
  <div
    class="editor-guides__panel displayNone"
    ref={(el) => {
      refs.panel = el
    }}
  >
    {SYMMETRY_SECTOR_COUNTS.map((count) => (
      <button type="button" class="editor-guides__chip" data-symmetry={count}>
        {count}
      </button>
    ))}
    <div class="editor-guides__divider" />
    <button
      type="button"
      class="editor-guides__chip editor-guides__chip--icon"
      data-origin-handle="toggle"
      aria-label="Hide mirror center handle"
    >
      <div class="editor-guides__action-icon svg-icon-move svg-icon-dark" />
    </button>
  </div>
)

const bindPanel = () => {
  if (!refs.panel) return
  refs.panel.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    const t = e.target as HTMLElement
    const handleBtn = t.closest('[data-origin-handle]') as HTMLElement | null
    if (handleBtn) {
      setShowOriginHandle(!guidesState.showOriginHandle)
      syncGuidesPanelUi()
      notify()
      return
    }
    const sym = t.closest('[data-symmetry]') as HTMLElement | null
    if (!sym?.dataset.symmetry) return
    const mode = sym.dataset.symmetry as SymmetryMode
    setSymmetryMode(mode)
    syncGuidesPanelUi()
    notify()
  })
}

export const mountGuidesPanel = (container: HTMLElement) => {
  mount(container, GuidesPanelView())
  bindPanel()
  syncGuidesPanelUi()
}

export const showGuidesPanel = () => {
  refs.panel?.classList.remove('displayNone')
  syncGuidesPanelUi()
}

export const closeGuidesPanel = () => {
  refs.panel?.classList.add('displayNone')
}
