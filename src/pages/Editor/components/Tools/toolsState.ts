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
import brush12Url from 'static/img/tools/brush-12.png'
import brush13Url from 'static/img/tools/brush-13.png'
import brush14Url from 'static/img/tools/brush-14.png'
import brush15Url from 'static/img/tools/brush-15.png'
import brush16Url from 'static/img/tools/brush-16.png'
import brush17Url from 'static/img/tools/brush-17.png'
import brush18Url from 'static/img/tools/brush-18.png'
import brush19Url from 'static/img/tools/brush-19.png'
import brush20Url from 'static/img/tools/brush-20.png'
import brush21Url from 'static/img/tools/brush-21.png'
import brush22Url from 'static/img/tools/brush-22.png'
import brush23Url from 'static/img/tools/brush-23.png'
import brush24Url from 'static/img/tools/brush-24.png'
import brush25Url from 'static/img/tools/brush-25.png'
import brush26Url from 'static/img/tools/brush-26.png'
import brush27Url from 'static/img/tools/brush-27.png'
import brush28Url from 'static/img/tools/brush-28.png'
import brush29Url from 'static/img/tools/brush-29.png'
import brush30Url from 'static/img/tools/brush-30.png'
import brush31Url from 'static/img/tools/brush-31.png'
import brush32Url from 'static/img/tools/brush-32.png'
import brush33Url from 'static/img/tools/brush-33.png'
import brush34Url from 'static/img/tools/brush-34.png'
import brush35Url from 'static/img/tools/brush-35.png'
import brush36Url from 'static/img/tools/brush-36.png'
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
    'magicWand',
    'eraser',
    'smudge',
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
  'brush-12': brush12Url,
  'brush-13': brush13Url,
  'brush-14': brush14Url,
  'brush-15': brush15Url,
  'brush-16': brush16Url,
  'brush-17': brush17Url,
  'brush-18': brush18Url,
  'brush-19': brush19Url,
  'brush-20': brush20Url,
  'brush-21': brush21Url,
  'brush-22': brush22Url,
  'brush-23': brush23Url,
  'brush-24': brush24Url,
  'brush-25': brush25Url,
  'brush-26': brush26Url,
  'brush-27': brush27Url,
  'brush-28': brush28Url,
  'brush-29': brush29Url,
  'brush-30': brush30Url,
  'brush-31': brush31Url,
  'brush-32': brush32Url,
  'brush-33': brush33Url,
  'brush-34': brush34Url,
  'brush-35': brush35Url,
  'brush-36': brush36Url,
  'highlighter-h': highlighterHUrl,
  'highlighter-l': highlighterLUrl,
  'highlighter-r': highlighterRUrl,
  'highlighter-v': highlighterVUrl,
}

export const toolsFrameFiles: Record<string, HTMLImageElement> = {}
