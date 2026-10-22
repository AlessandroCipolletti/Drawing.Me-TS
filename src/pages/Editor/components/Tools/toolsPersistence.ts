import * as ColorPicker from 'pages/Editor/components/ColorPicker'
import { editorFacade } from 'pages/Editor/editorFacade'
import { ToolConfigProps, ToolCustomPropsMap, ToolVersionDefinition } from 'pages/Editor/config'
import { CurrentToolProps } from 'pages/Editor/editorTypes'
import { getImageFromUrl } from 'utils/imageUtils'
import {
  config,
  initToolsConfig,
  PersistedToolCustomProps,
  refs,
  SelectedToolDescriptor,
  state,
  toolsConfig,
  toolsFrameFiles,
  toolsImgs,
} from './toolsState'

export const setEditorToolByVersion = (tool: string, versionIndex: number | string) => {
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
  } else {
    toolProps.version = undefined
  }

  ColorPicker.deselectPipette(false)
  editorFacade.setTool(toolProps)
}

export const setCurrentToolCustomProps = (customProps: ToolCustomPropsMap) => {
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

export const getCurrentToolCustomProps = (): ToolCustomPropsMap => {
  if (!toolsConfig) return {}
  const versionIndex = state.selectedVersions[state.selectedTool]
  if (versionIndex >= 0) {
    return toolsConfig[state.selectedTool].versions[versionIndex].customProps
  } else {
    return toolsConfig[state.selectedTool].customProps || {}
  }
}

export type ResolvedToolVersionProps = Omit<ToolConfigProps, 'color'> &
  Partial<CurrentToolProps> & {
    version?: string | number
    versionName?: string
  }

export const getOneToolVersionCompleteProps = (
  tool: string,
  versionIndex: number | false = false,
  higherProps: Partial<CurrentToolProps> = {}
): ResolvedToolVersionProps => {
  const activeConfig = toolsConfig || initToolsConfig()
  const resolvedVersionIndex =
    versionIndex === false ? state.selectedVersions?.[tool] : versionIndex

  let toolProps: ResolvedToolVersionProps
  if (activeConfig[tool].versions.length && resolvedVersionIndex >= 0) {
    toolProps = {
      ...activeConfig[tool],
      ...activeConfig[tool].versions[resolvedVersionIndex].props,
      ...activeConfig[tool].versions[resolvedVersionIndex].customProps,
      name: activeConfig[tool].name,
      versionName: activeConfig[tool].versions[resolvedVersionIndex].name,
      ...higherProps,
    }
  } else {
    toolProps = {
      ...activeConfig[tool],
      ...activeConfig[tool].customProps,
      ...higherProps,
    }
  }

  toolProps.frameImageFile =
    (toolProps.frameImageName && toolsFrameFiles[toolProps.frameImageName]) || null

  delete (toolProps as { customProps?: unknown }).customProps
  delete (toolProps as { versions?: unknown }).versions
  return toolProps
}

export const getCurrentSelectedTool = (): SelectedToolDescriptor => ({
  name: state.selectedTool,
  version: parseInt(String(state.selectedVersions[state.selectedTool]), 10) || false,
})

const getToolCustomProps = (
  tool: ToolConfigProps | ToolVersionDefinition
): PersistedToolCustomProps => {
  const res: PersistedToolCustomProps = {
    name: tool.name,
    customProps: tool.customProps,
  }
  if ('versions' in tool && tool.versions && tool.versions.length > 0) {
    res.versions = tool.versions.map(getToolCustomProps)
  }
  return res
}

export const getToolsCustomProps = (): PersistedToolCustomProps[] => {
  if (!toolsConfig) return []
  let toolsCustomProps = Object.values(toolsConfig).map(getToolCustomProps)
  toolsCustomProps.forEach((tool) => {
    if (!tool.customProps || Object.keys(tool.customProps).length === 0) {
      delete tool.customProps
    }
    if (tool.versions) {
      tool.versions = tool.versions.filter(
        (version) => version.customProps && Object.keys(version.customProps).length
      )
      if (tool.versions.length === 0) {
        delete tool.versions
      }
    }
  })
  toolsCustomProps = toolsCustomProps.filter((tool) => tool.customProps || tool.versions)
  return toolsCustomProps
}

export const mergeCustomProps = (toolsCustomProps: PersistedToolCustomProps[] = []) => {
  if (toolsConfig && toolsCustomProps && toolsCustomProps.length) {
    const legacyHardBrushVersions = toolsCustomProps.find((e) => e.name === 'hardBrush')?.versions
    Object.values(toolsConfig).forEach((tool) => {
      const customTool = toolsCustomProps.find((e) => e.name === tool.name)
      const legacyVersions = tool.name === 'brush' ? legacyHardBrushVersions : undefined
      if (customTool || legacyVersions) {
        tool.customProps = customTool?.customProps || {}
        if (tool.versions?.length > 0) {
          tool.versions.forEach((version) => {
            version.customProps =
              customTool?.versions?.find((v) => v.name === version.name)?.customProps ||
              legacyVersions?.find((v) => v.name === version.name)?.customProps ||
              {}
          })
        }
      }
    })
  }
}

export const initToolsImages = async () => {
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
          const versionButton = (refs.toolsVersions[tool.name]?.querySelector(
            `[data-versionsIndex='${i}']`
          ) ||
            document.querySelector(
              `.editor-tools__versions-${tool.name} [data-versionsIndex='${i}']`
            )) as HTMLElement | null
          if (versionButton) {
            versionButton.innerHTML = ''
            versionButton.classList.add('editor-tools__versions-button-image')
            versionButton.style.setProperty(
              '--version-preview-image',
              `url('${toolsImgs[frameImageName]}')`
            )
          }
        }
      }
    }
  }
}
