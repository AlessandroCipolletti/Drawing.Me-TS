import Params from 'main/Params'
import { toolDefaultProps, ToolConfigProps, ToolCustomPropsMap } from 'pages/Editor/config'
import { round, logarithmicPercToValue } from 'utils/mathUtils'

import {
  TOOL_FRAME_CIRCLE,
  TOOL_FRAME_PARTICLES_RECT,
  TOOL_FRAME_PARTICLES_CIRCLE,
  TOOL_FRAME_SPRAY_CIRCLE,
  TOOL_FRAME_IMAGE,
} from 'pages/Editor/constants'

const hardBrushStampProps = (
  overrides: Partial<ToolConfigProps> = {}
): Partial<ToolConfigProps> => {
  const minSize = 10
  const maxSize = Params.isPhone ? round(100 / 3, 0) : 100
  const minAlpha = 0.003
  const maxAlpha = 0.11
  return {
    minSize,
    maxSize,
    size: logarithmicPercToValue(50, minSize, maxSize, 1),
    sizeForceFactor: 1,
    sizeSpeedFactor: 0.4,
    sizeAltitudeFactor: 4,
    minAlpha,
    maxAlpha,
    alpha: logarithmicPercToValue(50, minAlpha, maxAlpha, 3),
    alphaForceFactor: 0.05,
    forceCurve: 0.85,
    altitudeCurve: 1.0,
    aspectRatio: 1,
    aspectAltitudeFactor: 0.9,
    aspectForceFactor: 0.25,
    jitterPosition: 0.03,
    jitterSize: 0.06,
    jitterAlpha: 0.08,
    jitterRotation: 0.15,
    endTaperFactor: 0.5,
    ...overrides,
  }
}

const getCustomTool = (
  props: Partial<ToolConfigProps>,
  versions: Array<{
    name: string
    props: Partial<ToolConfigProps>
    customProps?: ToolCustomPropsMap
  }> = []
): ToolConfigProps => {
  const tool: ToolConfigProps = {
    ...toolDefaultProps,
    ...props,
    customProps: { ...(props.customProps || {}) },
    versions: versions.map((v) => ({
      ...v,
      customProps: {},
    })),
  }
  if (Params.isPhone) {
    tool.maxSize = round(tool.maxSize / 3, 0)
  }
  if (tool.hasSizeAndAlpha) {
    tool.size = logarithmicPercToValue(50, tool.minSize, tool.maxSize, 1)
    tool.alpha = logarithmicPercToValue(50, tool.minAlpha, tool.maxAlpha, 3)
  }
  return tool
}

const toolsConfigInit = (): Record<string, ToolConfigProps> => ({
  marker: getCustomTool({
    name: 'marker',
    frameType: TOOL_FRAME_CIRCLE,
    opaqueFramesAtMaxAlpha: true,
    minSize: 2,
    sizeForceFactor: 0,
    sizeSpeedFactor: 0,
    sizeAltitudeFactor: 0,
    minAlpha: 0.003,
    maxAlpha: 0.24,
    alphaForceFactor: 0.075,
    alphaSpeedFactor: -0.02,
    forceCurve: 1.2,
    altitudeCurve: 1.35,
    useTimeBasedSpeed: true,
    speedSmoothing: 0.4,
    stabilization: 0.25,
    aspectRatio: 1,
    aspectAltitudeFactor: 0,
    aspectForceFactor: 0,
    handleStylusRotation: true,
    handleStylusTwist: true,
    endTaperFactor: 0.45,
    completeEndSegment: true,
    preserveStampRemainder: true,
    usePredictedEvents: true,
    maxSizeThatNeedsToAdaptLine: 75,
    pxToAdaptLine: 15,
    msToAdaptLine: 10,
    stepsToAdaptLine: 5,
    sizeToFramesRatio: 1 / 40,
  }),
  pencil: getCustomTool(
    {
      name: 'pencil',
      hasSizeAndAlpha: false,
      handleStylusRotation: true,
      handleStylusTwist: true,
      useTimeBasedSpeed: true,
      speedSmoothing: 0.35,
      stabilization: 0.15,
      completeEndSegment: true,
      preserveStampRemainder: true,
      usePredictedEvents: true,
      maxSizeThatNeedsToAdaptLine: 75,
      pxToAdaptLine: 12,
      msToAdaptLine: 8,
      stepsToAdaptLine: 4,
    },
    [
      {
        name: '2H',
        props: {
          frameType: TOOL_FRAME_PARTICLES_RECT,
          size: 2,
          minSize: 2,
          maxSize: 8,
          sizeAltitudeFactor: 3,
          sizeForceFactor: 0.2,
          alpha: 0.06,
          minAlpha: 0.06,
          maxAlpha: 0.3,
          alphaForceFactor: 0.35,
          alphaAltitudeFactor: -0.1,
          forceCurve: 1.35,
          altitudeCurve: 1.3,
          aspectRatio: 1,
          aspectAltitudeFactor: 1.4,
          aspectForceFactor: 0.05,
          jitterPosition: 0.03,
          jitterSize: 0.04,
          jitterAlpha: 0.08,
          endTaperFactor: 0.5,
          sizeToFramesRatio: 1 / 2,
        },
      },
      {
        name: 'HB',
        props: {
          frameType: TOOL_FRAME_PARTICLES_CIRCLE,
          size: 3,
          minSize: 3,
          maxSize: 10,
          sizeAltitudeFactor: 1.5,
          sizeForceFactor: 0.4,
          alpha: 0.06,
          minAlpha: 0.06,
          maxAlpha: 0.25,
          alphaForceFactor: 0.25,
          alphaAltitudeFactor: -0.05,
          forceCurve: 1.0,
          altitudeCurve: 1.15,
          aspectRatio: 1,
          aspectAltitudeFactor: 1.8,
          aspectForceFactor: 0.15,
          jitterPosition: 0.04,
          jitterSize: 0.06,
          jitterAlpha: 0.1,
          endTaperFactor: 0.45,
          sizeToFramesRatio: 1 / 2,
        },
      },
      {
        name: '2B',
        props: {
          frameType: TOOL_FRAME_PARTICLES_CIRCLE,
          size: 3,
          minSize: 3,
          maxSize: 9,
          sizeAltitudeFactor: 2,
          sizeForceFactor: 1,
          alpha: 0.1,
          minAlpha: 0.1,
          maxAlpha: 0.4,
          alphaForceFactor: 0.4,
          alphaAltitudeFactor: -0.1,
          forceCurve: 0.75,
          altitudeCurve: 1.0,
          aspectRatio: 1,
          aspectAltitudeFactor: 2.2,
          aspectForceFactor: 0.25,
          jitterPosition: 0.06,
          jitterSize: 0.08,
          jitterAlpha: 0.14,
          jitterRotation: 0.2,
          endTaperFactor: 0.35,
          sizeToFramesRatio: 1 / 2,
          minPxDistanceBetweenFrames: 2,
        },
      },
    ]
  ),
  highlighter: getCustomTool(
    {
      name: 'highlighter',
      frameType: TOOL_FRAME_IMAGE,
      minSize: 15,
      maxSize: 200,
      sizeAltitudeFactor: 3,
      sizeForceFactor: 0.15,
      minAlpha: 0.01,
      maxAlpha: 0.5,
      alphaForceFactor: 0.3,
      alphaSpeedFactor: -0.02,
      forceCurve: 1.25,
      altitudeCurve: 1.2,
      useTimeBasedSpeed: true,
      speedSmoothing: 0.5,
      stabilization: 0.35,
      aspectRatio: 1.25,
      aspectAltitudeFactor: 0.5,
      aspectForceFactor: 0.1,
      showVersionPreview: true,
      sizeToFramesRatio: 1 / 70,
      handleStylusRotation: true,
      handleStylusTwist: true,
      handlePathRotation: false,
      endTaperFactor: 0.15,
      completeEndSegment: true,
      preserveStampRemainder: true,
      usePredictedEvents: true,
      maxSizeThatNeedsToAdaptLine: 75,
      pxToAdaptLine: 18,
      msToAdaptLine: 12,
      stepsToAdaptLine: 5,
      minPxDistanceBetweenFrames: 0.1,
    },
    [
      {
        name: 'right',
        props: {
          frameImageName: Params.isDesktop ? 'highlighter-r' : 'highlighter-h',
          aspectRatio: 1.3,
          aspectAltitudeFactor: 0.55,
        },
      },
      {
        name: 'left',
        props: {
          frameImageName: Params.isDesktop ? 'highlighter-l' : 'highlighter-v',
          aspectRatio: 1.2,
          aspectAltitudeFactor: 0.45,
        },
      },
    ]
  ),
  brush: getCustomTool(
    {
      name: 'brush',
      frameType: TOOL_FRAME_IMAGE,
      showVersionPreview: true,
      sizeToFramesRatio: 1 / 100,
      minPxDistanceBetweenFrames: 0.1,
      handleStylusRotation: true,
      handleStylusTwist: true,
      minSize: 6,
      maxSize: 100,
      sizeForceFactor: 3,
      sizeSpeedFactor: -0.25,
      sizeAltitudeFactor: 2,
      minAlpha: 0.003,
      maxAlpha: 0.5,
      alphaForceFactor: 0.03,
      alphaSpeedFactor: -0.015,
      forceCurve: 0.72,
      altitudeCurve: 1.1,
      useTimeBasedSpeed: true,
      speedSmoothing: 0.45,
      stabilization: 0.3,
      aspectRatio: 1,
      aspectAltitudeFactor: 0.75,
      aspectForceFactor: 0.3,
      endTaperFactor: 0.65,
      completeEndSegment: true,
      preserveStampRemainder: true,
      usePredictedEvents: true,
      maxSizeThatNeedsToAdaptLine: 75,
      pxToAdaptLine: 14,
      msToAdaptLine: 10,
      stepsToAdaptLine: 5,
    },
    [
      {
        name: '1',
        props: {
          frameImageName: 'brush-1',
          forceCurve: 0.7,
          stabilization: 0.35,
          aspectAltitudeFactor: 0.6,
          endTaperFactor: 0.7,
        },
      },
      {
        name: '2',
        props: {
          frameImageName: 'brush-2',
          forceCurve: 0.75,
          aspectRatio: 1.25,
          aspectAltitudeFactor: 1.1,
          aspectForceFactor: 0.35,
        },
      },
      {
        name: '3',
        props: {
          frameImageName: 'brush-3',
          forceCurve: 0.68,
          sizeSpeedFactor: -0.35,
          endTaperFactor: 0.75,
        },
      },
      {
        name: '4',
        props: {
          frameImageName: 'brush-4',
          forceCurve: 0.65,
          jitterAlpha: 0.04,
          jitterSize: 0.03,
        },
      },
      {
        name: '5',
        props: {
          frameImageName: 'brush-5',
          forceCurve: 0.78,
          jitterPosition: 0.02,
          jitterRotation: 0.08,
          jitterAlpha: 0.05,
        },
      },
      {
        name: '6',
        props: {
          frameImageName: 'brush-6',
          ...hardBrushStampProps({ jitterRotation: 0.12, aspectAltitudeFactor: 0.8 }),
        },
      },
      {
        name: '7',
        props: {
          frameImageName: 'brush-7',
          ...hardBrushStampProps({ jitterPosition: 0.04, jitterRotation: 0.18 }),
        },
      },
      {
        name: '8',
        props: {
          frameImageName: 'brush-8',
          ...hardBrushStampProps({ forceCurve: 0.8, jitterSize: 0.08, jitterAlpha: 0.1 }),
        },
      },
      {
        name: '9',
        props: {
          frameImageName: 'brush-9',
          ...hardBrushStampProps({ aspectAltitudeFactor: 1.1, jitterRotation: 0.2 }),
        },
      },
      {
        name: '10',
        props: {
          frameImageName: 'brush-10',
          ...hardBrushStampProps({ jitterPosition: 0.05, jitterSize: 0.07 }),
        },
      },
      {
        name: '11',
        props: {
          frameImageName: 'brush-11',
          ...hardBrushStampProps({ forceCurve: 0.9, jitterRotation: 0.25, jitterAlpha: 0.12 }),
        },
      },
    ]
  ),
  spray: getCustomTool({
    name: 'spray',
    frameType: TOOL_FRAME_SPRAY_CIRCLE,
    size: 50,
    minSize: 10,
    maxSize: 250,
    sizeForceFactor: 0.25,
    sizeSpeedFactor: 0.15,
    sizeAltitudeFactor: 0.8,
    sizeToFramesRatio: 1 / 20,
    minPxDistanceBetweenFrames: 2,
    minAlpha: 0.04,
    alphaForceFactor: 0.5,
    alphaSpeedFactor: -0.15,
    forceCurve: 0.9,
    altitudeCurve: 1.1,
    useTimeBasedSpeed: true,
    speedSmoothing: 0.5,
    stabilization: 0.2,
    aspectRatio: 1,
    aspectAltitudeFactor: 0.6,
    handleStylusRotation: true,
    handleStylusTwist: true,
    jitterPosition: 0.05,
    jitterSize: 0.08,
    jitterAlpha: 0.1,
    endTaperFactor: 0.4,
    completeEndSegment: true,
    preserveStampRemainder: true,
    maxSizeThatNeedsToAdaptLine: 0,
    stepsToUpdateCoworking: 10,
  }),
  customBrush: getCustomTool({
    name: 'customBrush',
    frameType: TOOL_FRAME_CIRCLE,
    minSize: 2,
    sizeForceFactor: 0.3,
    sizeSpeedFactor: -0.08,
    sizeAltitudeFactor: 0.35,
    minAlpha: 0.003,
    maxAlpha: 0.24,
    alphaForceFactor: 0.075,
    alphaSpeedFactor: -0.02,
    forceCurve: 1.2,
    altitudeCurve: 1.35,
    useTimeBasedSpeed: true,
    speedSmoothing: 0.4,
    stabilization: 0.25,
    aspectRatio: 1,
    aspectAltitudeFactor: 0.25,
    aspectForceFactor: 0.1,
    handleStylusRotation: true,
    handleStylusTwist: true,
    endTaperFactor: 0.45,
    completeEndSegment: true,
    preserveStampRemainder: true,
    usePredictedEvents: true,
    maxSizeThatNeedsToAdaptLine: 75,
    pxToAdaptLine: 15,
    msToAdaptLine: 10,
    stepsToAdaptLine: 5,
    sizeToFramesRatio: 1 / 40,
  }),
  eraser: getCustomTool({
    name: 'eraser',
    frameType: TOOL_FRAME_CIRCLE,
    globalCompositeOperation: 'destination-out',
    opaqueFramesAtMaxAlpha: true,
    cursor: true,
    minSize: 3,
    maxSize: 400,
    sizeForceFactor: 0.2,
    forceCurve: 1.0,
    useTimeBasedSpeed: true,
    speedSmoothing: 0.35,
    stabilization: 0.15,
    endTaperFactor: 0,
    completeEndSegment: true,
    preserveStampRemainder: true,
    maxSizeThatNeedsToAdaptLine: 75,
    pxToAdaptLine: 15,
    msToAdaptLine: 10,
    stepsToAdaptLine: 5,
    sizeToFramesRatio: 1 / 100,
    minAlpha: 0.003,
    maxAlpha: 1,
  }),
  bucket: getCustomTool(
    {
      name: 'bucket',
      hasSizeAndAlpha: false,
      maxSizeThatNeedsToAdaptLine: 0,
    },
    []
  ),
  magicWand: getCustomTool(
    {
      name: 'magicWand',
      hasSizeAndAlpha: false,
      maxSizeThatNeedsToAdaptLine: 0,
    },
    []
  ),
  pipette: getCustomTool(
    {
      name: 'pipette',
      hasSizeAndAlpha: false,
    },
    []
  ),
})

export default toolsConfigInit
