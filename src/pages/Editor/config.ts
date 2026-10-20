export type ToolCustomPropsMap = {
  size?: number
  alpha?: number
  [key: string]: unknown
}

export interface ToolVersionDefinition {
  name: string
  props: Partial<ToolConfigProps> & { image?: HTMLImageElement }
  customProps: ToolCustomPropsMap
}

export interface ToolConfigProps {
  name: string
  size: number
  minSize: number
  maxSize: number
  sizeForceFactor: number
  sizeSpeedFactor: number
  sizeAltitudeFactor: number
  alpha: number
  minAlpha: number
  maxAlpha: number
  alphaForceFactor: number
  alphaSpeedFactor: number
  alphaAltitudeFactor: number
  sizeToFramesRatio: number
  minPxDistanceBetweenFrames: number
  degradeAlphaBySize: boolean
  showVersionPreview: boolean
  frameType: string | false
  frameImageName: string | false
  frameImageFile: HTMLImageElement | ImageBitmap | HTMLCanvasElement | null
  handleStylusRotation: boolean
  handlePathRotation: boolean
  globalCompositeOperation?: GlobalCompositeOperation
  color?: string
  cursor: boolean
  maxSizeThatNeedsToAdaptLine: number
  pxToAdaptLine: number
  msToAdaptLine: number
  stepsToAdaptLine: number
  stepsToUpdateCoworking: number
  hasSizeAndAlpha: boolean
  customProps: ToolCustomPropsMap
  versions: ToolVersionDefinition[]
}

export const toolDefaultProps: ToolConfigProps = {
  name: '',

  size: 25,
  minSize: 10,
  maxSize: 400,
  sizeForceFactor: 0,
  sizeSpeedFactor: 0,
  sizeAltitudeFactor: 0,

  alpha: 0.3,
  minAlpha: 0.01,
  maxAlpha: 1,
  alphaForceFactor: 0,
  alphaSpeedFactor: 0,
  alphaAltitudeFactor: 0,

  sizeToFramesRatio: 1,
  minPxDistanceBetweenFrames: 1,

  degradeAlphaBySize: false,
  showVersionPreview: false,
  frameType: false,
  frameImageName: false,
  frameImageFile: null,
  handleStylusRotation: false,
  handlePathRotation: false,
  cursor: false,
  maxSizeThatNeedsToAdaptLine: 75,
  pxToAdaptLine: 15,
  msToAdaptLine: 10,
  stepsToAdaptLine: 5,
  stepsToUpdateCoworking: 5,
  hasSizeAndAlpha: true,

  customProps: {},
  versions: [],
}

export const editorDefaultConfig = {
  draftTimeInterval: 30_000,
  draftStepsInterval: 50,
  stepsRequiredToMakeACopy: 10,
  maxSpeedFactorLength: 150,
  defaultForceTouch: 0.1,
  defaultAltitudeAngle: Math.PI / 3,
  initialForceTouchBugValue: 0.07999999999999999,
  maxSupportedStylusAltitudeFactor: 0.844,
  defaultToolParams: { ...toolDefaultProps },
  maxScale: 5.0,
  minScale: 0.3,
  maxCanvasSize: 4096,
  canvasScaleWithGoodPerformance: 1,
  minAltitudeFactorToHandleRotation: 0.3,
  resizeRotationStep: 2.5,
  resizeRotationInterval: 45,
  draftInfoDuration: 3_000,
}
