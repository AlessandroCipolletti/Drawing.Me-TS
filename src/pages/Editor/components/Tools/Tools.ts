import tplTools from './tools.tpl?raw'
import './tools.css'

import Params from 'main/Params'
import * as Editor from 'pages/Editor'
import * as Ruler from 'pages/Editor/components/Ruler'
import * as Layers from 'pages/Editor/components/Layers'
import * as ColorPicker from 'pages/Editor/components/ColorPicker'
import { preventDefault, loadTemplate } from 'utils/domUtils'
import { deepCopy } from 'utils/jsUtils'
import { getImageFromUrl } from 'utils/imageUtils'
import { addRotationHandler, removeRotationHandler, cleanRefs } from 'utils/moduleUtils'

import toolsConfigInit from './toolsConfig'

import brush1Url from 'static/img/tools/brush-1.png'
import brush2Url from 'static/img/tools/brush-2.png'
import brush3Url from 'static/img/tools/brush-3.png'
import brush4Url from 'static/img/tools/brush-4.png'
import brush5Url from 'static/img/tools/brush-5.png'
import brush6Url from 'static/img/tools/brush-6.png'
import brush7Url from 'static/img/tools/brush-7.png'
import brush8Url from 'static/img/tools/brush-8.png'
import brush9Url from 'static/img/tools/brush-9.png'
import brush10Url from 'static/img/tools/brush-10.png'
import brush11Url from 'static/img/tools/brush-11.png'
import highlighterHUrl from 'static/img/tools/highlighter-h.png'
import highlighterLUrl from 'static/img/tools/highlighter-l.png'
import highlighterRUrl from 'static/img/tools/highlighter-r.png'
import highlighterVUrl from 'static/img/tools/highlighter-v.png'

let toolsConfig: Record<string, any> | undefined

const config = {
  tools: [
    'marker',
    'pencil',
    'highlighter',
    'brush',
    'hardBrush',
    'spray',
    'bucket',
    'eraser',
    'ruler',
    'undo',
    'redo',
    'paper',
    'clear',
  ],
  writingTools: ['pencil', 'marker', 'highlighter', 'brush', 'hardBrush', 'spray'],
  toolsDisabledByDefault: ['undo', 'redo'],
  versionsCloseDelay: 7 * 1000,
  papers: ['white', 'squares', 'lines', 'points'],
  initialSelectedVersions: {
    pencil: 0,
    highlighter: 0,
    brush: 0,
    hardBrush: 0,
  } as Record<string, number>,
}

let state: Record<string, any> = {}
const initialState = {
  selectedTool: 'marker',
  currentPaper: config.papers[0],
  toolsMaxScroll: 0,
  currentScroll: 0,
  versionsTimeout: false as ReturnType<typeof setTimeout> | false,
  openVersionsEl: null as HTMLElement | null,
  lastUsedTool: '',
  selectedVersions: { ...config.initialSelectedVersions },
  actionsPromises: [] as Array<() => Promise<any>>,
}

const refs: {
  toolsContainer: HTMLElement | null
  versionsContainer: HTMLElement | null
  toolsButtons: Record<string, HTMLElement>
  toolsVersions: Record<string, HTMLElement>
} = {
  toolsContainer: null,
  versionsContainer: null,
  toolsButtons: {},
  toolsVersions: {},
}

const toolsImgs: Record<string, string> = {
  'brush-1': brush1Url,
  'brush-2': brush2Url,
  'brush-3': brush3Url,
  'brush-4': brush4Url,
  'brush-5': brush5Url,
  'brush-6': brush6Url,
  'brush-7': brush7Url,
  'brush-8': brush8Url,
  'brush-9': brush9Url,
  'brush-10': brush10Url,
  'brush-11': brush11Url,
  'highlighter-h': highlighterHUrl,
  'highlighter-l': highlighterLUrl,
  'highlighter-r': highlighterRUrl,
  'highlighter-v': highlighterVUrl,
}

const toolsFrameFiles: Record<string, HTMLImageElement> = {}

const toolsFunctions: Record<string, (selected?: boolean) => any> = {
  marker: (selected) => {
    if (selected) {
      toggleVersions('marker')
    } else {
      selectTool('marker')
    }
  },
  pencil: (selected) => {
    if (selected) {
      toggleVersions('pencil')
    } else {
      selectTool('pencil')
    }
  },
  spray: (selected) => {
    if (selected) {
      toggleVersions('spray')
    } else {
      selectTool('spray')
    }
  },
  highlighter: (selected) => {
    if (selected) {
      toggleVersions('highlighter')
    } else {
      selectTool('highlighter')
    }
  },
  brush: (selected) => {
    if (selected) {
      toggleVersions('brush')
    } else {
      selectTool('brush')
    }
  },
  hardBrush: (selected) => {
    if (selected) {
      toggleVersions('hardBrush')
    } else {
      selectTool('hardBrush')
    }
  },
  eraser: (selected) => {
    if (selected) {
      toggleVersions('eraser')
    } else {
      selectTool('eraser')
    }
  },
  bucket: () => {
    selectTool('bucket')
  },
  pipette: () => {
    selectTool('pipette')
  },
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
    Editor.changePaper(state.currentPaper)
  },
  undo: () => PushNewActionPromise(Layers.undoLayers),
  redo: () => PushNewActionPromise(Layers.redoLayers),
  clear: () => {
    Editor.clear()
  },
}

const PushNewActionPromise = async (promise: () => Promise<any>) => {
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

export const closeVersions = () => {
  if (state.versionsTimeout !== false) {
    state.openVersionsEl?.classList.remove('editor-tools__versions-open')
    state.openVersionsEl = null
    clearTimeout(state.versionsTimeout)
    state.versionsTimeout = false
  }
}

const selectInitialTools = (selectedTool: any = false) => {
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
  Editor.changePaper(state.currentPaper)
  setTimeout(onRotate, 100)
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
    versionIndex !== false ? Number(versionIndex) : parseInt(state.selectedVersions[tool], 10)

  setEditorToolByVersion(tool, resolvedIndex)
  closeVersions()
  if (showToolChange) {
    toggleVersions(tool)
  }
}

const setEditorToolByVersion = (tool: string, versionIndex: number | string) => {
  if (!toolsConfig) return
  const numIndex = Number(versionIndex)
  const toolProps = getOneToolVersionCompleteProps(tool, numIndex)
  state.selectedTool = tool

  if (config.tools.includes(tool)) {
    for (const [name, btn] of Object.entries(refs.toolsButtons)) {
      btn.classList.toggle('editor-tools__tool-selected', name === tool)
    }
  }

  if (toolsConfig[tool]?.versions?.length) {
    refs.toolsVersions[tool]
      ?.querySelector('.editor-tools__versions-button-selected')
      ?.classList.remove('editor-tools__versions-button-selected')
    refs.toolsVersions[tool]
      ?.querySelector(`.editor-tools__versions-button[data-versionsIndex="${numIndex}"]`)
      ?.classList.add('editor-tools__versions-button-selected')
    state.selectedVersions[tool] = numIndex
    toolProps.version = numIndex
  }

  ColorPicker.deselectPipette(false)
  Editor.setTool(toolProps)
}

export const selectLastUsedTool = (showToolChange = true) => {
  if (state.lastUsedTool) {
    selectTool(state.lastUsedTool, false, showToolChange)
  }
}

const toggleActiveTool = (tool: string) =>
  refs.toolsContainer
    ?.querySelector(`.editor-tools__tool-${tool}`)
    ?.classList.toggle('editor-tools__tool-activated')

export const setCurrentToolCustomProps = (customProps: Record<string, any>) => {
  if (!toolsConfig) return
  const versionIndex = state.selectedVersions[state.selectedTool]
  if (versionIndex >= 0) {
    const version = toolsConfig[state.selectedTool].versions[versionIndex]
    version.customProps = {
      ...version.customProps,
      ...customProps,
    }
  } else {
    const tool = toolsConfig[state.selectedTool]
    tool.customProps = {
      ...tool.customProps,
      ...customProps,
    }
  }

  setEditorToolByVersion(state.selectedTool, versionIndex)
}

export const getCurrentToolCustomProps = () => {
  if (!toolsConfig) return {}
  const versionIndex = state.selectedVersions[state.selectedTool]
  if (versionIndex >= 0) {
    return toolsConfig[state.selectedTool].versions[versionIndex].customProps
  } else {
    return toolsConfig[state.selectedTool].customProps || {}
  }
}

export const getOneToolVersionCompleteProps = (
  tool: string,
  versionIndex: number | false = false,
  higherProps: Record<string, any> = {}
) => {
  if (!toolsConfig) toolsConfig = toolsConfigInit()
  const resolvedVersionIndex =
    versionIndex === false ? state.selectedVersions?.[tool] : versionIndex

  let toolProps: Record<string, any>
  if (toolsConfig[tool].versions.length && resolvedVersionIndex >= 0) {
    toolProps = {
      ...toolsConfig[tool],
      ...toolsConfig[tool].versions[resolvedVersionIndex].props,
      ...toolsConfig[tool].versions[resolvedVersionIndex].customProps,
      name: toolsConfig[tool].name,
      versionName: toolsConfig[tool].versions[resolvedVersionIndex].name,
      ...higherProps,
    }
  } else {
    toolProps = {
      ...toolsConfig[tool],
      ...toolsConfig[tool].customProps,
      ...higherProps,
    }
  }

  toolProps.frameImageFile = toolsFrameFiles[toolProps.frameImageName] || null

  delete toolProps.customProps
  delete toolProps.versions
  return toolProps
}

export const getCurrentSelectedTool = () => ({
  name: state.selectedTool,
  version: parseInt(state.selectedVersions[state.selectedTool], 10) || false,
})

export const getToolsCustomProps = () => {
  if (!toolsConfig) return []
  let toolsCustomProps = Object.values(toolsConfig).map(getToolCustomProps)
  toolsCustomProps.forEach((tool: any) => {
    if (Object.keys(tool.customProps).length === 0) {
      delete tool.customProps
    }
    if (tool.versions) {
      tool.versions = tool.versions.filter(
        (version: any) => Object.keys(version.customProps).length
      )
      if (tool.versions.length === 0) {
        delete tool.versions
      }
    }
  })
  toolsCustomProps = toolsCustomProps.filter((tool: any) => tool.customProps || tool.versions)
  return toolsCustomProps
}

const getToolCustomProps = (tool: any): any => {
  const res: Record<string, any> = {
    name: tool.name,
    customProps: tool.customProps,
  }
  if (tool.versions && tool.versions.length > 0) {
    res.versions = tool.versions.map(getToolCustomProps)
  }
  return res
}

const onVersionsTouchStart = (_el: HTMLElement, e: any) => {
  preventDefault(e)
  const target = e.target.nodeName === 'P' ? e.target.parentNode : e.target
  if (
    target.classList.contains('editor-tools__versions-button') &&
    !target.classList.contains('editor-tools__versions-button-selected')
  ) {
    if (state.versionsTimeout) clearTimeout(state.versionsTimeout)
    state.versionsTimeout = setTimeout(closeVersions, config.versionsCloseDelay)
    setEditorToolByVersion(
      target.getAttribute('data-tool'),
      target.getAttribute('data-versionsIndex')
    )
  }
}

let toolsDragStartY = 0
let toolsDragInitialScroll = 0

const onToolsScrollTouchStart = (e: any) => {
  if ((typeof e.button === 'number' && e.button > 0) || (e.touches && e.touches.length > 1)) {
    e.preventDefault()
    return
  }
  if (refs.toolsContainer) {
    state.toolsMaxScroll = Math.max(
      0,
      refs.toolsContainer.scrollHeight - refs.toolsContainer.clientHeight
    )
  }
  toolsDragStartY = e.clientY ?? e.touches?.[0]?.clientY ?? 0
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

const onToolsScrollTouchMove = (e: any) => {
  if (e.pointerType === 'mouse' && state.toolsMaxScroll > 0 && refs.toolsContainer) {
    const moveY = e.clientY ?? 0
    refs.toolsContainer.scrollTop = toolsDragInitialScroll - (moveY - toolsDragStartY)
  }
}

const onToolsScrollTouchEnd = async (e: any) => {
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
  const tool = e.target?.getAttribute?.('data-tool')
  if (
    tool &&
    e.target.classList.contains('editor-tools__tool') &&
    !e.target.classList.contains('disabled')
  ) {
    if (Object.prototype.hasOwnProperty.call(toolsFunctions, tool)) {
      await toolsFunctions[tool](e.target.classList.contains('editor-tools__tool-selected'))
    }
  }
}

const onRotate = () => {
  if (refs.toolsContainer) {
    state.toolsMaxScroll = refs.toolsContainer.scrollHeight - refs.toolsContainer.clientHeight
  }
}

const initToolsImages = async () => {
  if (!toolsConfig) return
  const promises: Promise<void>[] = []

  for (const frameName of Object.keys(toolsImgs)) {
    const frameFileName = toolsImgs[frameName]
    promises.push(
      getImageFromUrl(frameFileName).then((img) => {
        if (img) toolsFrameFiles[frameName] = img
      })
    )
  }

  await Promise.all(promises)

  for (const tool of Object.values(toolsConfig)) {
    for (let i = 0; i < tool.versions.length; i++) {
      const version = tool.versions[i]
      const frameImageName = version.props.frameImageName || tool.frameImageName

      if (frameImageName) {
        const showVersionPreview = version.props.showVersionPreview || tool.showVersionPreview
        if (showVersionPreview) {
          const versionButton = document.querySelector(
            `.editor-tools__versions-${tool.name} [data-versionsIndex='${i}']`
          ) as HTMLElement | null
          if (versionButton) {
            versionButton.innerHTML = ''
            versionButton.style.backgroundImage = `url('${toolsImgs[frameImageName]}')`
          }
        }
      }
    }
  }
}

const mergeCustomProps = (toolsCustomProps: any[] = []) => {
  if (toolsConfig && toolsCustomProps && toolsCustomProps.length) {
    Object.values(toolsConfig).forEach((tool: any) => {
      const customTool = toolsCustomProps.find((e) => e.name === tool.name)
      if (customTool) {
        tool.customProps = customTool.customProps || {}
        if (tool.versions?.length > 0 && customTool.versions?.length > 0) {
          tool.versions.forEach((version: any) => {
            version.customProps =
              customTool.versions.find((v: any) => v.name === version.name)?.customProps || {}
          })
        }
      }
    })
  }
}

const initDom = async (moduleContainer: HTMLElement) => {
  if (!toolsConfig) return
  const toolsData = config.tools.map((name) => ({
    name,
    disabled: config.toolsDisabledByDefault.includes(name),
    versions: toolsConfig?.[name] ? toolsConfig[name].versions : false,
  }))

  const dom = (await loadTemplate(tplTools, { toolsData }, moduleContainer)) as HTMLElement[]
  refs.toolsContainer = dom[0]
  refs.versionsContainer = dom[1]

  for (const tool of config.tools) {
    const btn = refs.toolsContainer.querySelector(
      `.editor-tools__tool-${tool}`
    ) as HTMLElement | null
    if (btn) refs.toolsButtons[tool] = btn
    if (toolsConfig[tool]?.versions?.length) {
      const verEl = refs.versionsContainer.querySelector(
        `.editor-tools__versions-${tool}`
      ) as HTMLElement | null
      if (verEl) {
        refs.toolsVersions[tool] = verEl
        verEl.addEventListener(Params.eventStart, (e) => onVersionsTouchStart(verEl, e), true)
      }
    }
  }
  refs.toolsButtons.paper?.classList.add('paper-squares')
  refs.toolsContainer.addEventListener(Params.eventStart, onToolsScrollTouchStart)
  await initToolsImages()
}

export const init = async (
  moduleContainer: HTMLElement,
  toolsCustomProps?: any[],
  selectedTool?: any
) => {
  toolsConfig = toolsConfigInit()
  mergeCustomProps(toolsCustomProps)
  await initDom(moduleContainer)
  state = deepCopy(initialState)
  selectInitialTools(selectedTool)
  addRotationHandler(onRotate)
}

export const remove = () => {
  removeRotationHandler(onRotate)
  closeVersions()
  if (state.versionsTimeout) clearTimeout(state.versionsTimeout)

  state = {}
  toolsConfig = undefined
  cleanRefs(refs)
}
