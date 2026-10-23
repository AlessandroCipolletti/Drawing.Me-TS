import type { ToolConfigProps, ToolCustomPropsMap } from 'pages/Editor/config'

export type CustomBrushDraftProps = Partial<
  Omit<ToolConfigProps, 'name' | 'versions' | 'frameImageFile' | 'color' | 'customProps'>
> & {
  frameImageBase64?: string
}

export interface CustomBrushPersisted {
  id: string
  props: CustomBrushDraftProps
  customProps?: ToolCustomPropsMap
}
