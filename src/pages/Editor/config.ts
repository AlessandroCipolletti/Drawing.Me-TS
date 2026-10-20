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
  customProps: Record<string, any>
  versions?: Array<{
    name: string
    props: Partial<ToolConfigProps> & { image?: HTMLImageElement }
    customProps?: Record<string, any>
  }>
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
}
