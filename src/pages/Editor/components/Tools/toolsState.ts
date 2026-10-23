import { deepCopy } from 'utils/jsUtils'
import { ToolConfigProps, ToolCustomPropsMap } from 'pages/Editor/config'
import { ToolsRefs } from './ToolsView'
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

export interface SelectedToolDescriptor {
  name: string
  version: number | false
}

export interface PersistedToolCustomProps {
  name: string
  customProps?: ToolCustomPropsMap
  versions?: PersistedToolCustomProps[]
}

export const config = {
  tools: [
    'marker',
    'pencil',
    'highlighter',
    'brush',
    'spray',
    'customBrush',
    'bucket',
    'eraser',
    'ruler',
    'undo',
    'redo',
    'paper',
    'clear',
  ],
  writingTools: ['pencil', 'marker', 'highlighter', 'brush', 'spray', 'customBrush'],
  toolsDisabledByDefault: ['undo', 'redo'],
  versionsCloseDelay: 7 * 1000,
  papers: ['white', 'squares', 'lines', 'points'],
  initialSelectedVersions: {
    pencil: 0,
    highlighter: 0,
    brush: 0,
    customBrush: 0,
  } as Record<string, number>,
}

export interface ToolsState {
  selectedTool: string
  currentPaper: string
  toolsMaxScroll: number
  currentScroll: number
  versionsTimeout: ReturnType<typeof setTimeout> | false
  openVersionsEl: HTMLElement | null
  lastUsedTool: string
  selectedVersions: Record<string, number>
  actionsPromises: Array<() => Promise<unknown>>
}

const initialState: ToolsState = {
  selectedTool: 'marker',
  currentPaper: config.papers[0],
  toolsMaxScroll: 0,
  currentScroll: 0,
  versionsTimeout: false,
  openVersionsEl: null,
  lastUsedTool: '',
  selectedVersions: { ...config.initialSelectedVersions },
  actionsPromises: [],
}

export let state: ToolsState = deepCopy(initialState)

export const resetToolsState = () => {
  state = deepCopy(initialState)
}

export let toolsConfig: Record<string, ToolConfigProps> | undefined

export const initToolsConfig = () => {
  toolsConfig = toolsConfigInit()
  return toolsConfig
}

export const clearToolsConfig = () => {
  toolsConfig = undefined
}

export const refs: ToolsRefs = {
  toolsContainer: null,
  versionsContainer: null,
  toolsButtons: {},
  toolsVersions: {},
}

export const toolsImgs: Record<string, string> = {
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

export const toolsFrameFiles: Record<string, HTMLImageElement> = {}
