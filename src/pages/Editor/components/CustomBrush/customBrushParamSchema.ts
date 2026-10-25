import {
  TOOL_FRAME_CIRCLE,
  TOOL_FRAME_IMAGE,
  TOOL_FRAME_PARTICLES_CIRCLE,
  TOOL_FRAME_PARTICLES_RECT,
  TOOL_FRAME_SPRAY_CIRCLE,
  TOOL_FRAME_SQUARE,
  TOOL_FRAME_TRIANGLE,
} from 'pages/Editor/constants'
import { round } from 'utils/mathUtils'
import type { CustomBrushDraftProps } from './customBrushTypes'

type ParamControlKind = 'slider' | 'toggle' | 'segmented' | 'select'

type ParamSectionId =
  | 'size-alpha'
  | 'motion'
  | 'aspect'
  | 'jitter'
  | 'taper'
  | 'spacing'
  | 'stamp'
  | 'density'
  | 'color'
  | 'rotation'
  | 'predicted'
  | 'adapt'
  | 'advanced'

export interface ParamSectionMeta {
  id: ParamSectionId
  label: string
  collapsible?: boolean
}

interface ParamSchemaOption {
  value: string
  label: string
}

export interface CustomBrushParamSchemaEntry {
  key: keyof CustomBrushDraftProps
  label: string
  kind: ParamControlKind
  section: ParamSectionId
  min?: number
  max?: number
  decimals?: number
  /** Logarithmic slider so the low end of the range keeps most of the travel. */
  scale?: 'log'
  options?: ParamSchemaOption[]
  visibleWhen?: (draft: CustomBrushDraftProps) => boolean
}

export interface FrameOptionDescriptor {
  id: string
  frameType: string
  label: string
  isCustomDraw?: boolean
  isImageUpload?: boolean
}

export const CUSTOM_BRUSH_FRAME_OPTIONS: FrameOptionDescriptor[] = [
  { id: 'circle', frameType: TOOL_FRAME_CIRCLE, label: 'Circle' },
  { id: 'square', frameType: TOOL_FRAME_SQUARE, label: 'Square' },
  { id: 'triangle', frameType: TOOL_FRAME_TRIANGLE, label: 'Triangle' },
  { id: 'sprayCircle', frameType: TOOL_FRAME_SPRAY_CIRCLE, label: 'Spray' },
  { id: 'particlesCircle', frameType: TOOL_FRAME_PARTICLES_CIRCLE, label: 'Dots ○' },
  { id: 'particlesRect', frameType: TOOL_FRAME_PARTICLES_RECT, label: 'Dots □' },
  { id: 'image', frameType: TOOL_FRAME_IMAGE, label: 'Image', isImageUpload: true },
  { id: 'customDraw', frameType: TOOL_FRAME_IMAGE, label: 'Draw', isCustomDraw: true },
]

export const PARAM_SECTIONS: ParamSectionMeta[] = [
  { id: 'density', label: 'Frame' },
  { id: 'size-alpha', label: 'Size & Opacity' },
  { id: 'taper', label: 'Taper' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'stamp', label: 'Stamp' },
  { id: 'motion', label: 'Motion' },
  { id: 'aspect', label: 'Aspect' },
  { id: 'jitter', label: 'Jitter' },
  { id: 'color', label: 'Color Jitter' },
  { id: 'rotation', label: 'Rotation & Stylus' },
  { id: 'predicted', label: 'Prediction' },
  { id: 'adapt', label: 'Line Adapt' },
  { id: 'advanced', label: 'Blend' },
]

export const CUSTOM_BRUSH_PARAM_SCHEMA: CustomBrushParamSchemaEntry[] = [
  // Frame-specific density (placed right under the frame row when active)
  {
    key: 'sprayDensity',
    label: 'Spray Density',
    kind: 'slider',
    section: 'density',
    min: 0.1,
    max: 10,
    decimals: 2,
    visibleWhen: (d) => d.frameType === TOOL_FRAME_SPRAY_CIRCLE,
  },
  {
    key: 'sprayRadiusFactor',
    label: 'Spray Spread',
    kind: 'slider',
    section: 'density',
    min: 0.05,
    max: 5,
    decimals: 3,
    visibleWhen: (d) => d.frameType === TOOL_FRAME_SPRAY_CIRCLE,
  },
  {
    key: 'particleDensity',
    label: 'Dot Density',
    kind: 'slider',
    section: 'density',
    min: 0.1,
    max: 10,
    decimals: 2,
    visibleWhen: (d) =>
      d.frameType === TOOL_FRAME_PARTICLES_CIRCLE || d.frameType === TOOL_FRAME_PARTICLES_RECT,
  },

  // Size & Opacity
  {
    key: 'size',
    label: 'Size',
    kind: 'slider',
    section: 'size-alpha',
    min: 1,
    max: 400,
    decimals: 0,
  },
  {
    key: 'minSize',
    label: 'Min Size',
    kind: 'slider',
    section: 'size-alpha',
    min: 1,
    max: 400,
    decimals: 1,
  },
  {
    key: 'maxSize',
    label: 'Max Size',
    kind: 'slider',
    section: 'size-alpha',
    min: 1,
    max: 400,
    decimals: 1,
  },
  {
    key: 'sizeForceFactor',
    label: 'Size · Pressure',
    kind: 'slider',
    section: 'size-alpha',
    min: -2,
    max: 4,
    decimals: 3,
  },
  {
    key: 'sizeSpeedFactor',
    label: 'Size · Speed',
    kind: 'slider',
    section: 'size-alpha',
    min: -2,
    max: 2,
    decimals: 3,
  },
  {
    key: 'sizeAltitudeFactor',
    label: 'Size · Tilt',
    kind: 'slider',
    section: 'size-alpha',
    min: -2,
    max: 5,
    decimals: 3,
  },
  {
    key: 'sizeTangentialFactor',
    label: 'Size · Barrel',
    kind: 'slider',
    section: 'size-alpha',
    min: -2,
    max: 2,
    decimals: 3,
  },
  {
    key: 'alpha',
    label: 'Opacity',
    kind: 'slider',
    section: 'size-alpha',
    min: 0.001,
    max: 0.25,
    decimals: 3,
    scale: 'log',
  },
  {
    key: 'minAlpha',
    label: 'Min Opacity',
    kind: 'slider',
    section: 'size-alpha',
    min: 0.001,
    max: 0.25,
    decimals: 3,
    scale: 'log',
  },
  {
    key: 'maxAlpha',
    label: 'Max Opacity',
    kind: 'slider',
    section: 'size-alpha',
    min: 0.001,
    max: 0.25,
    decimals: 3,
    scale: 'log',
  },
  {
    key: 'alphaForceFactor',
    label: 'Alpha · Pressure',
    kind: 'slider',
    section: 'size-alpha',
    min: -1,
    max: 1,
    decimals: 3,
  },
  {
    key: 'alphaSpeedFactor',
    label: 'Alpha · Speed',
    kind: 'slider',
    section: 'size-alpha',
    min: -1,
    max: 1,
    decimals: 3,
  },
  {
    key: 'alphaAltitudeFactor',
    label: 'Alpha · Tilt',
    kind: 'slider',
    section: 'size-alpha',
    min: -1,
    max: 1,
    decimals: 3,
  },
  {
    key: 'alphaTangentialFactor',
    label: 'Alpha · Barrel',
    kind: 'slider',
    section: 'size-alpha',
    min: -1,
    max: 1,
    decimals: 3,
  },
  {
    key: 'forceCurve',
    label: 'Pressure Curve',
    kind: 'slider',
    section: 'size-alpha',
    min: 0.1,
    max: 4,
    decimals: 3,
  },
  {
    key: 'altitudeCurve',
    label: 'Tilt Curve',
    kind: 'slider',
    section: 'size-alpha',
    min: 0.1,
    max: 4,
    decimals: 3,
  },
  {
    key: 'speedCurve',
    label: 'Speed Curve',
    kind: 'slider',
    section: 'size-alpha',
    min: 0.1,
    max: 4,
    decimals: 3,
  },
  {
    key: 'degradeAlphaBySize',
    label: 'Scale Alpha/Size',
    kind: 'toggle',
    section: 'size-alpha',
  },
  {
    key: 'opaqueFramesAtMaxAlpha',
    label: 'Solid at 100%',
    kind: 'toggle',
    section: 'size-alpha',
  },

  // Taper
  {
    key: 'startTaperFactor',
    label: 'Start Taper',
    kind: 'slider',
    section: 'taper',
    min: 0,
    max: 1,
    decimals: 3,
  },
  {
    key: 'endTaperFactor',
    label: 'End Taper',
    kind: 'slider',
    section: 'taper',
    min: 0,
    max: 1,
    decimals: 3,
  },
  {
    key: 'endTaperSizeAmount',
    label: 'End Taper Size',
    kind: 'slider',
    section: 'taper',
    min: 0,
    max: 1,
    decimals: 3,
  },
  {
    key: 'endTaperAlphaCurve',
    label: 'Taper Alpha Curve',
    kind: 'slider',
    section: 'taper',
    min: 0.1,
    max: 4,
    decimals: 3,
  },

  // Spacing
  {
    key: 'stampSpacingMode',
    label: 'Spacing Mode',
    kind: 'segmented',
    section: 'spacing',
    options: [
      { value: 'bySize', label: 'Ratio' },
      { value: 'fixed', label: 'Fixed px' },
    ],
  },
  {
    key: 'sizeToFramesRatio',
    label: 'Step Ratio',
    kind: 'slider',
    section: 'spacing',
    min: 0.005,
    max: 2,
    decimals: 3,
    visibleWhen: (d) => (d.stampSpacingMode || 'bySize') === 'bySize',
  },
  {
    key: 'minPxDistanceBetweenFrames',
    label: 'Min Step px',
    kind: 'slider',
    section: 'spacing',
    min: 1,
    max: 50,
    decimals: 0,
    visibleWhen: (d) => (d.stampSpacingMode || 'bySize') === 'bySize',
  },
  {
    key: 'stampSpacingFixedPx',
    label: 'Fixed Step px',
    kind: 'slider',
    section: 'spacing',
    min: 0.1,
    max: 50,
    decimals: 2,
    visibleWhen: (d) => d.stampSpacingMode === 'fixed',
  },
  {
    key: 'preserveStampRemainder',
    label: 'Keep Remainder',
    kind: 'toggle',
    section: 'spacing',
  },
  {
    key: 'completeEndSegment',
    label: 'Complete End',
    kind: 'toggle',
    section: 'spacing',
  },

  // Stamp look
  {
    key: 'flow',
    label: 'Flow',
    kind: 'slider',
    section: 'stamp',
    min: 0.01,
    max: 1,
    decimals: 3,
  },
  {
    key: 'buildup',
    label: 'Buildup',
    kind: 'slider',
    section: 'stamp',
    min: 0,
    max: 1,
    decimals: 3,
  },
  {
    key: 'stampScaleX',
    label: 'Scale X',
    kind: 'slider',
    section: 'stamp',
    min: 0.05,
    max: 5,
    decimals: 3,
  },
  {
    key: 'stampScaleY',
    label: 'Scale Y',
    kind: 'slider',
    section: 'stamp',
    min: 0.05,
    max: 5,
    decimals: 3,
  },
  {
    key: 'stampBlur',
    label: 'Soft Blur',
    kind: 'slider',
    section: 'stamp',
    min: 0,
    max: 32,
    decimals: 0,
    visibleWhen: (d) =>
      !d.frameType ||
      d.frameType === TOOL_FRAME_CIRCLE ||
      d.frameType === TOOL_FRAME_SQUARE ||
      d.frameType === TOOL_FRAME_TRIANGLE,
  },
  {
    key: 'stampRotationOffset',
    label: 'Angle Offset',
    kind: 'slider',
    section: 'stamp',
    min: -3.142,
    max: 3.142,
    decimals: 3,
  },

  // Motion & stabilization
  {
    key: 'stabilization',
    label: 'Stabilization',
    kind: 'slider',
    section: 'motion',
    min: 0,
    max: 0.95,
    decimals: 3,
  },
  {
    key: 'speedSmoothing',
    label: 'Speed Smooth',
    kind: 'slider',
    section: 'motion',
    min: 0,
    max: 0.95,
    decimals: 3,
  },
  {
    key: 'useTimeBasedSpeed',
    label: 'Time Velocity',
    kind: 'toggle',
    section: 'motion',
  },
  {
    key: 'maxVelocityPxPerMs',
    label: 'Max px/ms',
    kind: 'slider',
    section: 'motion',
    min: 0.1,
    max: 10,
    decimals: 3,
    visibleWhen: (d) => Boolean(d.useTimeBasedSpeed),
  },

  // Aspect ratio
  {
    key: 'aspectRatio',
    label: 'Aspect Ratio',
    kind: 'slider',
    section: 'aspect',
    min: 0.2,
    max: 5,
    decimals: 2,
  },
  {
    key: 'minAspectRatio',
    label: 'Min Aspect',
    kind: 'slider',
    section: 'aspect',
    min: 0.1,
    max: 5,
    decimals: 2,
  },
  {
    key: 'maxAspectRatio',
    label: 'Max Aspect',
    kind: 'slider',
    section: 'aspect',
    min: 0.2,
    max: 10,
    decimals: 2,
  },
  {
    key: 'aspectAltitudeFactor',
    label: 'Aspect · Tilt',
    kind: 'slider',
    section: 'aspect',
    min: -2,
    max: 3,
    decimals: 3,
  },
  {
    key: 'aspectForceFactor',
    label: 'Aspect · Force',
    kind: 'slider',
    section: 'aspect',
    min: -2,
    max: 3,
    decimals: 3,
  },
  {
    key: 'jitterAspectRatio',
    label: 'Aspect Jitter',
    kind: 'slider',
    section: 'aspect',
    min: 0,
    max: 2,
    decimals: 3,
  },

  // Jitter
  {
    key: 'jitterPosition',
    label: 'Pos Jitter',
    kind: 'slider',
    section: 'jitter',
    min: 0,
    max: 1,
    decimals: 3,
  },
  {
    key: 'jitterSize',
    label: 'Size Jitter',
    kind: 'slider',
    section: 'jitter',
    min: 0,
    max: 1,
    decimals: 3,
  },
  {
    key: 'jitterAlpha',
    label: 'Alpha Jitter',
    kind: 'slider',
    section: 'jitter',
    min: 0,
    max: 1,
    decimals: 3,
  },
  {
    key: 'jitterRotation',
    label: 'Angle Jitter',
    kind: 'slider',
    section: 'jitter',
    min: 0,
    max: 3.142,
    decimals: 3,
  },

  // Color variation
  {
    key: 'colorJitterHue',
    label: 'Hue Jitter °',
    kind: 'slider',
    section: 'color',
    min: 0,
    max: 180,
    decimals: 0,
  },
  {
    key: 'colorJitterSat',
    label: 'Sat Jitter',
    kind: 'slider',
    section: 'color',
    min: 0,
    max: 1,
    decimals: 3,
  },
  {
    key: 'colorJitterLight',
    label: 'Light Jitter',
    kind: 'slider',
    section: 'color',
    min: 0,
    max: 1,
    decimals: 3,
  },

  // Rotation & stylus
  {
    key: 'handleStylusRotation',
    label: 'Stylus Azimuth',
    kind: 'toggle',
    section: 'rotation',
  },
  {
    key: 'handleStylusTwist',
    label: 'Stylus Twist',
    kind: 'toggle',
    section: 'rotation',
  },
  {
    key: 'handlePathRotation',
    label: 'Follow Path',
    kind: 'toggle',
    section: 'rotation',
  },
  {
    key: 'pathRotationWeight',
    label: 'Path Weight',
    kind: 'slider',
    section: 'rotation',
    min: 0,
    max: 1,
    decimals: 3,
    visibleWhen: (d) => Boolean(d.handlePathRotation),
  },
  {
    key: 'rotationSmoothing',
    label: 'Angle Smooth',
    kind: 'slider',
    section: 'rotation',
    min: 0,
    max: 1,
    decimals: 3,
  },
  {
    key: 'minAltitudeFactorToHandleRotation',
    label: 'Min Tilt Azimuth',
    kind: 'slider',
    section: 'rotation',
    min: 0,
    max: 1,
    decimals: 3,
  },

  // Predicted events
  {
    key: 'usePredictedEvents',
    label: 'Predict Stroke',
    kind: 'toggle',
    section: 'predicted',
  },
  {
    key: 'predictedEventsBlend',
    label: 'Predict Alpha',
    kind: 'slider',
    section: 'predicted',
    min: 0,
    max: 1,
    decimals: 3,
    visibleWhen: (d) => Boolean(d.usePredictedEvents),
  },

  // Line adaptation
  {
    key: 'maxSizeThatNeedsToAdaptLine',
    label: 'Adapt Below px',
    kind: 'slider',
    section: 'adapt',
    min: 0,
    max: 200,
    decimals: 0,
  },
  {
    key: 'pxToAdaptLine',
    label: 'Adapt Dist px',
    kind: 'slider',
    section: 'adapt',
    min: 1,
    max: 60,
    decimals: 0,
  },
  {
    key: 'msToAdaptLine',
    label: 'Adapt Time ms',
    kind: 'slider',
    section: 'adapt',
    min: 1,
    max: 60,
    decimals: 0,
  },
  {
    key: 'stepsToAdaptLine',
    label: 'Adapt Steps',
    kind: 'slider',
    section: 'adapt',
    min: 1,
    max: 30,
    decimals: 0,
  },

  // Collapsible Advanced blend mode
  {
    key: 'stampCompositeOperation',
    label: 'Stamp Blend',
    kind: 'select',
    section: 'advanced',
    options: [
      { value: '', label: 'Default' },
      { value: 'source-over', label: 'Normal' },
      { value: 'multiply', label: 'Multiply' },
      { value: 'screen', label: 'Screen' },
      { value: 'overlay', label: 'Overlay' },
      { value: 'darken', label: 'Darken' },
      { value: 'lighten', label: 'Lighten' },
      { value: 'color-dodge', label: 'Dodge' },
      { value: 'color-burn', label: 'Burn' },
      { value: 'hard-light', label: 'Hard Light' },
      { value: 'soft-light', label: 'Soft Light' },
      { value: 'difference', label: 'Difference' },
    ],
  },
]

export const clampAndRoundSchemaValue = (
  entry: CustomBrushParamSchemaEntry,
  rawValue: number
): number => {
  if (entry.kind !== 'slider') return rawValue
  const min = entry.min ?? 0
  const max = entry.max ?? 1
  const decimals = entry.decimals ?? 3
  const clamped = Math.min(max, Math.max(min, rawValue))
  return round(clamped, decimals)
}

export const formatSchemaNumber = (entry: CustomBrushParamSchemaEntry, value: unknown): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0'
  const decimals = entry.decimals ?? 3
  const rounded = round(value, decimals)
  return String(rounded)
}
