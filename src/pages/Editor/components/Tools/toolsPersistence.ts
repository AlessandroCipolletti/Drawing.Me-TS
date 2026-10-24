import { editorCalls, registerEditorCalls } from 'pages/Editor/editorCalls'
import {
  getCustomBrushAt,
  getCustomBrushCount,
  getCustomBrushCustomProps,
  getHydratedCustomBrushImage,
  getSelectedCustomBrushIndex,
  setCustomBrushCustomProps,
  setSelectedCustomBrushByIndex,
} from 'pages/Editor/components/CustomBrush/customBrushStore'
import { editorFacade } from 'pages/Editor/editorFacade'
import { ToolConfigProps, ToolCustomPropsMap, ToolVersionDefinition } from 'pages/Editor/config'
import { TOOL_FRAME_CIRCLE, TOOL_FRAME_IMAGE } from 'pages/Editor/constants'
import { CurrentToolProps } from 'pages/Editor/editorTypes'
import { getImageFromUrl } from 'utils/imageUtils'
import { normalizeToolDrawParams, sanitizeToolCustomProps } from 'utils/canvasUtils'
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
  let numIndex = Number(versionIndex)
  if (tool === 'customBrush') {
    const count = getCustomBrushCount()
    if (count > 0) {
      if (!Number.isFinite(numIndex) || numIndex < 0 || numIndex >= count) {
        const storedIdx = getSelectedCustomBrushIndex()
        numIndex = storedIdx >= 0 ? storedIdx : 0
      }
    } else {
      numIndex = 0
    }
  }
  const toolProps = getOneToolVersionCompleteProps(tool, numIndex)
  state.selectedTool = tool

  if (config.tools.includes(tool)) {
    for (const [name, btn] of Object.entries(refs.toolsButtons)) {
      btn.classList.toggle('editor-tools__tool-selected', name === tool)
    }
  }

  if (tool === 'customBrush') {
    const count = getCustomBrushCount()
    refs.toolsVersions.customBrush
      ?.querySelector('.editor-tools__versions-button-selected')
      ?.classList.remove('editor-tools__versions-button-selected')
    if (count > 0) {
      refs.toolsVersions.customBrush
        ?.querySelector(`.editor-tools__versions-button[data-versionsIndex="${numIndex}"]`)
        ?.classList.add('editor-tools__versions-button-selected')
      state.selectedVersions.customBrush = numIndex
      toolProps.version = numIndex
      void setSelectedCustomBrushByIndex(numIndex)
    } else {
      state.selectedVersions.customBrush = 0
      toolProps.version = undefined
    }
  } else if (toolsConfig[tool]?.versions?.length) {
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

  editorCalls.deselectPipette(false)
  editorFacade.setTool(toolProps)
}

const setCurrentToolCustomProps = (customProps: ToolCustomPropsMap) => {
  if (!toolsConfig) return
  const safeCustom = sanitizeToolCustomProps(customProps)
  const versionIndex = state.selectedVersions[state.selectedTool]
  if (state.selectedTool === 'customBrush') {
    const idx = typeof versionIndex === 'number' && versionIndex >= 0 ? versionIndex : 0
    if (getCustomBrushCount() > 0) {
      void setCustomBrushCustomProps(idx, safeCustom)
    } else {
      const tool = toolsConfig.customBrush
      tool.customProps = sanitizeToolCustomProps({
        ...tool.customProps,
        ...safeCustom,
      })
    }
    setEditorToolByVersion('customBrush', idx)
    return
  }
  if (versionIndex >= 0 && toolsConfig[state.selectedTool]?.versions?.[versionIndex]) {
    const version = toolsConfig[state.selectedTool].versions[versionIndex]
    version.customProps = sanitizeToolCustomProps({
      ...version.customProps,
      ...safeCustom,
    })
  } else {
    const tool = toolsConfig[state.selectedTool]
    tool.customProps = sanitizeToolCustomProps({
      ...tool.customProps,
      ...safeCustom,
    })
  }

  setEditorToolByVersion(state.selectedTool, versionIndex)
}

export const getCurrentToolCustomProps = (): ToolCustomPropsMap => {
  if (!toolsConfig) return {}
  const versionIndex = state.selectedVersions[state.selectedTool]
  if (state.selectedTool === 'customBrush' && getCustomBrushCount() > 0) {
    return getCustomBrushCustomProps(versionIndex >= 0 ? versionIndex : 0)
  }
  if (versionIndex >= 0 && toolsConfig[state.selectedTool]?.versions?.[versionIndex]) {
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

  const safeHigherProps = sanitizeToolCustomProps(higherProps) as Partial<CurrentToolProps>
  const baseTool = activeConfig[tool] || activeConfig.marker

  if (tool === 'customBrush') {
    const count = getCustomBrushCount()
    const targetIdx =
      typeof resolvedVersionIndex === 'number' &&
      Number.isFinite(resolvedVersionIndex) &&
      resolvedVersionIndex >= 0 &&
      resolvedVersionIndex < count
        ? resolvedVersionIndex
        : getSelectedCustomBrushIndex()
    const customEntry = targetIdx >= 0 ? getCustomBrushAt(targetIdx) : undefined

    if (customEntry) {
      const merged: ResolvedToolVersionProps = {
        ...baseTool,
        ...(customEntry.props as Partial<ToolConfigProps>),
        ...sanitizeToolCustomProps(customEntry.customProps),
        name: 'customBrush',
        versionName: String(targetIdx + 1),
        ...safeHigherProps,
      }
      if (merged.frameType === TOOL_FRAME_IMAGE) {
        const img = getHydratedCustomBrushImage(customEntry.id)
        if (img) {
          merged.frameImageFile = img
          const hashSuffix = customEntry.props.frameImageBase64
            ? customEntry.props.frameImageBase64.slice(-16)
            : 'img'
          merged.frameImageName = `custom-${customEntry.id}-${hashSuffix}`
        } else {
          merged.frameType = TOOL_FRAME_CIRCLE
          merged.frameImageFile = null
          merged.frameImageName = false
        }
      } else {
        merged.frameImageFile = null
        merged.frameImageName = false
      }
      delete (merged as { frameImageBase64?: unknown }).frameImageBase64
      delete (merged as { customProps?: unknown }).customProps
      delete (merged as { versions?: unknown }).versions
      return normalizeToolDrawParams(merged)
    }
  }
  let toolProps: ResolvedToolVersionProps
  if (
    baseTool.versions.length &&
    typeof resolvedVersionIndex === 'number' &&
    resolvedVersionIndex >= 0 &&
    baseTool.versions[resolvedVersionIndex]
  ) {
    toolProps = {
      ...baseTool,
      ...baseTool.versions[resolvedVersionIndex].props,
      ...sanitizeToolCustomProps(baseTool.versions[resolvedVersionIndex].customProps),
      name: baseTool.name,
      versionName: baseTool.versions[resolvedVersionIndex].name,
      ...safeHigherProps,
    }
  } else {
    toolProps = {
      ...baseTool,
      ...sanitizeToolCustomProps(baseTool.customProps),
      ...safeHigherProps,
    }
  }

  toolProps.frameImageFile =
    (toolProps.frameImageName && toolsFrameFiles[toolProps.frameImageName]) || null

  delete (toolProps as { customProps?: unknown }).customProps
  delete (toolProps as { versions?: unknown }).versions
  return normalizeToolDrawParams(toolProps)
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
        tool.customProps = sanitizeToolCustomProps(customTool?.customProps)
        if (tool.versions?.length > 0) {
          tool.versions.forEach((version) => {
            version.customProps = sanitizeToolCustomProps(
              customTool?.versions?.find((v) => v.name === version.name)?.customProps ||
                legacyVersions?.find((v) => v.name === version.name)?.customProps
            )
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

registerEditorCalls({
  setCurrentToolCustomProps,
})
