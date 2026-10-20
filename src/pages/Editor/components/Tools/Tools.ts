import './tools.css'

import Params from 'main/Params'
import { editorFacade } from 'pages/Editor/editorFacade'
import * as Ruler from 'pages/Editor/components/Ruler'
import * as Layers from 'pages/Editor/components/Layers'
import { preventDefault } from 'utils/domUtils'
import { addRotationHandler, removeRotationHandler, cleanRefs } from 'utils/moduleUtils'
import { mount } from 'ui/mount'

import { ToolsView } from './ToolsView'
import {
  clearToolsConfig,
  config,
  initToolsConfig,
  PersistedToolCustomProps,
  refs,
  resetToolsState,
  SelectedToolDescriptor,
  state,
  toolsConfig,
} from './toolsState'
import {
  getCurrentSelectedTool,
  getCurrentToolCustomProps,
  getOneToolVersionCompleteProps,
  getToolsCustomProps,
  initToolsImages,
  mergeCustomProps,
  setCurrentToolCustomProps,
  setEditorToolByVersion,
} from './toolsPersistence'

export type { PersistedToolCustomProps, SelectedToolDescriptor }
export {
  setCurrentToolCustomProps,
  getCurrentToolCustomProps,
  getOneToolVersionCompleteProps,
  getCurrentSelectedTool,
  getToolsCustomProps,
}

const PushNewActionPromise = async (promise: () => Promise<unknown>) => {
  state.actionsPromises.push(promise)
  if (state.actionsPromises.length === 1) {
    await executeOlderActionPromise()
  }
}

const executeOlderActionPromise = async () => {
  if (state.actionsPromises.length > 0) {
    await state.actionsPromises[0]()
    state.actionsPromises.shift()
    await executeOlderActionPromise()
  }
}

const toggleActiveTool = (tool: string) =>
  refs.toolsContainer
    ?.querySelector(`.editor-tools__tool-${tool}`)
    ?.classList.toggle('editor-tools__tool-activated')

export const closeVersions = () => {
  if (state.versionsTimeout !== false) {
    state.openVersionsEl?.classList.remove('editor-tools__versions-open')
    state.openVersionsEl = null
    clearTimeout(state.versionsTimeout)
    state.versionsTimeout = false
  }
}

const toggleVersions = (tool: string) => {
  Layers.closeResizeModeIfNeeded()
  const versions = refs.toolsVersions[tool]
  if (versions) {
    if (versions.classList.contains('editor-tools__versions-open')) {
      if (state.versionsTimeout) clearTimeout(state.versionsTimeout)
      state.versionsTimeout = false
      versions.classList.remove('editor-tools__versions-open')
      if (state.openVersionsEl === versions) {
        state.openVersionsEl = null
      }
    } else {
      if (state.openVersionsEl && state.openVersionsEl !== versions) {
        state.openVersionsEl.classList.remove('editor-tools__versions-open')
      }
      versions.classList.add('editor-tools__versions-open')
      state.openVersionsEl = versions
      if (state.versionsTimeout) clearTimeout(state.versionsTimeout)
      state.versionsTimeout = setTimeout(closeVersions, config.versionsCloseDelay)
    }
  }
}

const selectTool = (
  tool: string,
  versionIndex: number | string | false = false,
  showToolChange = true
) => {
  Layers.closeResizeModeIfNeeded()
  Layers.updateCurrentTool(tool === 'eraser')
  if (
    state.lastUsedTool !== state.selectedTool &&
    config.writingTools.includes(state.selectedTool)
  ) {
    state.lastUsedTool = state.selectedTool
  }
  const resolvedIndex =
    versionIndex !== false
      ? Number(versionIndex)
      : parseInt(String(state.selectedVersions[tool]), 10)

  setEditorToolByVersion(tool, resolvedIndex)
  closeVersions()
  if (showToolChange) {
    toggleVersions(tool)
  }
}

const toolsFunctions: Record<string, (selected?: boolean) => unknown> = {
  marker: (selected) => (selected ? toggleVersions('marker') : selectTool('marker')),
  pencil: (selected) => (selected ? toggleVersions('pencil') : selectTool('pencil')),
  spray: (selected) => (selected ? toggleVersions('spray') : selectTool('spray')),
  highlighter: (selected) => (selected ? toggleVersions('highlighter') : selectTool('highlighter')),
  brush: (selected) => (selected ? toggleVersions('brush') : selectTool('brush')),
  hardBrush: (selected) => (selected ? toggleVersions('hardBrush') : selectTool('hardBrush')),
  eraser: (selected) => (selected ? toggleVersions('eraser') : selectTool('eraser')),
  bucket: () => selectTool('bucket'),
  pipette: () => selectTool('pipette'),
  ruler: () => {
    if (toggleActiveTool('ruler')) {
      Ruler.show()
    } else {
      Ruler.hide()
    }
  },
  paper: () => {
    state.currentPaper =
      config.papers[(config.papers.indexOf(state.currentPaper) + 1) % config.papers.length]
    refs.toolsButtons.paper?.classList.remove(...config.papers.map((e) => `paper-${e}`))
    refs.toolsButtons.paper?.classList.add(
      `paper-${config.papers[(config.papers.indexOf(state.currentPaper) + 1) % config.papers.length]}`
    )
    editorFacade.changePaper(state.currentPaper)
  },
  undo: () => PushNewActionPromise(Layers.undoLayers),
  redo: () => PushNewActionPromise(Layers.redoLayers),
  clear: () => {
    editorFacade.clear()
  },
}

export const toggleButton = (tool: string, enabled: boolean) => {
  if (config.tools.indexOf(tool) >= 0) {
    const button = refs.toolsButtons[tool]
    if (button) {
      if (enabled) {
        button.classList.remove('disabled')
      } else {
        button.classList.add('disabled')
      }
    }
  }
}

export const clickButton = (tool: string) => {
  if (Object.prototype.hasOwnProperty.call(toolsFunctions, tool)) {
    toolsFunctions[tool]()
  }
}

export const selectLastUsedTool = (showToolChange = true) => {
  if (state.lastUsedTool) {
    selectTool(state.lastUsedTool, false, showToolChange)
  }
}

const onRotate = () => {
  if (refs.toolsContainer) {
    state.toolsMaxScroll = refs.toolsContainer.scrollHeight - refs.toolsContainer.clientHeight
  }
}

const selectInitialTools = (selectedTool: SelectedToolDescriptor | false = false) => {
  for (const [tool, versionContainer] of Object.entries(refs.toolsVersions)) {
    const selectedVersion = versionContainer.querySelector(
      '.editor-tools__versions-button-selected'
    )
    if (selectedVersion) {
      selectedVersion.classList.remove('editor-tools__versions-button-selected')
    }
    versionContainer.classList.remove('editor-tools__versions-open')
    versionContainer
      .querySelector(`[data-versionsIndex='${state.selectedVersions[tool]}']`)
      ?.classList.add('editor-tools__versions-button-selected')
  }
  state.openVersionsEl = null

  if (selectedTool && config.tools.includes(selectedTool.name)) {
    selectTool(selectedTool.name, selectedTool.version, false)
  } else {
    selectTool(state.selectedTool, false, false)
  }

  if (refs.toolsContainer) refs.toolsContainer.scrollTop = 0
  refs.toolsButtons.ruler?.classList.remove('editor-tools__tool-activated')
  state.currentPaper = config.papers[0]
  refs.toolsButtons.paper?.classList.remove(...config.papers.map((e) => `paper-${e}`))
  refs.toolsButtons.paper?.classList.add(`paper-${config.papers[1]}`)
  editorFacade.changePaper(state.currentPaper)
  setTimeout(onRotate, 100)
}

const onVersionsTouchStart = (_el: HTMLElement, e: Event) => {
  preventDefault(e)
  const rawTarget = e.target as HTMLElement | null
  const target = (
    rawTarget?.nodeName === 'P' ? rawTarget.parentNode : rawTarget
  ) as HTMLElement | null
  if (
    target?.classList?.contains('editor-tools__versions-button') &&
    !target.classList.contains('editor-tools__versions-button-selected')
  ) {
    if (state.versionsTimeout) clearTimeout(state.versionsTimeout)
    state.versionsTimeout = setTimeout(closeVersions, config.versionsCloseDelay)
    setEditorToolByVersion(
      target.getAttribute('data-tool') || '',
      target.getAttribute('data-versionsIndex') || '0'
    )
  }
}

let toolsDragStartY = 0
let toolsDragInitialScroll = 0

const onToolsScrollTouchStart = (e: Event) => {
  const evt = e as Event & { button?: number; touches?: TouchList; clientY?: number }
  if (
    (typeof evt.button === 'number' && evt.button > 0) ||
    (evt.touches && evt.touches.length > 1)
  ) {
    e.preventDefault()
    return
  }
  if (refs.toolsContainer) {
    state.toolsMaxScroll = Math.max(
      0,
      refs.toolsContainer.scrollHeight - refs.toolsContainer.clientHeight
    )
  }
  toolsDragStartY = evt.clientY ?? evt.touches?.[0]?.clientY ?? 0
  document.addEventListener(Params.eventMove, onToolsScrollTouchMove)
  document.addEventListener(Params.eventEnd, onToolsScrollTouchEnd)

  if (state.toolsMaxScroll > 0 && refs.toolsContainer) {
    if (!Params.isDesktop && refs.toolsContainer.scrollTop === 0) {
      state.currentScroll = refs.toolsContainer.scrollTop = 1
    } else if (!Params.isDesktop && refs.toolsContainer.scrollTop === state.toolsMaxScroll) {
      state.currentScroll = refs.toolsContainer.scrollTop = state.toolsMaxScroll - 1
    } else {
      state.currentScroll = refs.toolsContainer.scrollTop
    }
    toolsDragInitialScroll = refs.toolsContainer.scrollTop
  }
}

const onToolsScrollTouchMove = (e: Event) => {
  const evt = e as Event & { pointerType?: string; clientY?: number }
  if (evt.pointerType === 'mouse' && state.toolsMaxScroll > 0 && refs.toolsContainer) {
    const moveY = evt.clientY ?? 0
    refs.toolsContainer.scrollTop = toolsDragInitialScroll - (moveY - toolsDragStartY)
  }
}

const onToolsScrollTouchEnd = async (e: Event) => {
  preventDefault(e)
  document.removeEventListener(Params.eventMove, onToolsScrollTouchMove)
  document.removeEventListener(Params.eventEnd, onToolsScrollTouchEnd)
  if (
    state.toolsMaxScroll > 0 &&
    refs.toolsContainer &&
    Math.abs(state.currentScroll - refs.toolsContainer.scrollTop) > 10
  ) {
    return
  }
  state.currentScroll = 0
  const target = e.target as HTMLElement | null
  const tool = target?.getAttribute?.('data-tool')
  if (
    tool &&
    target?.classList.contains('editor-tools__tool') &&
    !target.classList.contains('disabled')
  ) {
    if (Object.prototype.hasOwnProperty.call(toolsFunctions, tool)) {
      await toolsFunctions[tool](target.classList.contains('editor-tools__tool-selected'))
    }
  }
}

const initDom = async (moduleContainer: HTMLElement) => {
  if (!toolsConfig) return
  const toolsData = config.tools.map((name) => ({
    name,
    disabled: config.toolsDisabledByDefault.includes(name),
    versions: toolsConfig?.[name] ? toolsConfig[name].versions : (false as const),
  }))

  refs.toolsButtons = {}
  refs.toolsVersions = {}
  mount(moduleContainer, ToolsView({ toolsData, refs }))

  for (const tool of config.tools) {
    if (toolsConfig[tool]?.versions?.length) {
      const verEl = refs.toolsVersions[tool]
      if (verEl) {
        verEl.addEventListener(Params.eventStart, (e) => onVersionsTouchStart(verEl, e), true)
      }
    }
  }
  refs.toolsButtons.paper?.classList.add('paper-squares')
  refs.toolsContainer?.addEventListener(Params.eventStart, onToolsScrollTouchStart)
  await initToolsImages()
}

export const init = async (
  moduleContainer: HTMLElement,
  toolsCustomProps?: PersistedToolCustomProps[],
  selectedTool?: SelectedToolDescriptor | false
) => {
  initToolsConfig()
  mergeCustomProps(toolsCustomProps)
  await initDom(moduleContainer)
  resetToolsState()
  selectInitialTools(selectedTool)
  addRotationHandler(onRotate)
}

export const remove = () => {
  removeRotationHandler(onRotate)
  closeVersions()
  if (state.versionsTimeout) clearTimeout(state.versionsTimeout)

  resetToolsState()
  clearToolsConfig()
  cleanRefs(refs)
}
