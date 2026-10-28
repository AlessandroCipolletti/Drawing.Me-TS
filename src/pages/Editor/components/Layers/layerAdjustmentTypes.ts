import type { LassoPoint } from './layerLasso'

export type AdjustmentFilterKind =
  | 'hsb'
  | 'hue'
  | 'saturation'
  | 'vibrance'
  | 'brightness'
  | 'temperature'
  | 'tint'
  | 'toneCurve'
  | 'blur'
  | 'sharpness'

export interface HsbParams {
  hue: number
  saturation: number
  brightness: number
}

export interface ToneCurveParams {
  amount: number
}

export interface TemperatureParams {
  amount: number
}

export interface TintParams {
  amount: number
}

export interface VibranceParams {
  amount: number
}

export interface SharpnessParams {
  amount: number
}

export interface BlurParams {
  radius: number
}

export type AdjustmentParams =
  | HsbParams
  | ToneCurveParams
  | TemperatureParams
  | TintParams
  | VibranceParams
  | SharpnessParams
  | BlurParams

interface AdjustmentSelectionSpec {
  points: LassoPoint[]
  rings?: LassoPoint[][]
  inverted?: boolean
}

export interface AdjustmentSpec {
  version: 1
  filter: AdjustmentFilterKind
  params: AdjustmentParams
  pipeline?: AdjustmentPipelineStep[]
  selection?: AdjustmentSelectionSpec | null
}

export const ADJUSTMENT_PROXY_MAX_EDGE = 1024
const DEFAULT_HSB: HsbParams = { hue: 0, saturation: 0, brightness: 0 }
const DEFAULT_TONE: ToneCurveParams = { amount: 0 }
const DEFAULT_TEMPERATURE: TemperatureParams = { amount: 0 }
const DEFAULT_TINT: TintParams = { amount: 0 }
const DEFAULT_VIBRANCE: VibranceParams = { amount: 0 }
const DEFAULT_SHARPNESS: SharpnessParams = { amount: 0 }
const DEFAULT_BLUR: BlurParams = { radius: 0 }

export const defaultParamsForFilter = (filter: AdjustmentFilterKind): AdjustmentParams => {
  if (filter === 'hsb' || filter === 'hue' || filter === 'saturation' || filter === 'brightness') {
    return { ...DEFAULT_HSB }
  }
  if (filter === 'toneCurve') return { ...DEFAULT_TONE }
  if (filter === 'temperature') return { ...DEFAULT_TEMPERATURE }
  if (filter === 'tint') return { ...DEFAULT_TINT }
  if (filter === 'vibrance') return { ...DEFAULT_VIBRANCE }
  if (filter === 'sharpness') return { ...DEFAULT_SHARPNESS }
  return { ...DEFAULT_BLUR }
}

const clampHsb = (p: HsbParams): HsbParams => ({
  hue: Math.max(-180, Math.min(180, Math.round(p.hue))),
  saturation: Math.max(-100, Math.min(100, Math.round(p.saturation))),
  brightness: Math.max(-100, Math.min(100, Math.round(p.brightness))),
})

const clampTone = (p: ToneCurveParams): ToneCurveParams => ({
  amount: Math.max(-100, Math.min(100, Math.round(p.amount))),
})

export const BLUR_RADIUS_MAX = 32
export const BRIGHTNESS_RANGE = 30
export const TEMPERATURE_RANGE = 40
export const TINT_RANGE = 40
export const VIBRANCE_RANGE = 100
export const SHARPNESS_RANGE = 40

const clampBlur = (p: BlurParams): BlurParams => ({
  radius: Math.max(0, Math.min(BLUR_RADIUS_MAX, Math.round(p.radius))),
})

export const clampParams = (
  filter: AdjustmentFilterKind,
  params: AdjustmentParams
): AdjustmentParams => {
  if (filter === 'brightness') {
    const p = clampHsb(params as HsbParams)
    return {
      ...p,
      brightness: Math.max(-BRIGHTNESS_RANGE, Math.min(BRIGHTNESS_RANGE, p.brightness)),
    }
  }
  if (filter === 'hsb' || filter === 'hue' || filter === 'saturation') {
    return clampHsb(params as HsbParams)
  }
  if (filter === 'toneCurve') return clampTone(params as ToneCurveParams)
  if (filter === 'temperature') {
    const p = params as TemperatureParams
    return {
      amount: Math.max(-TEMPERATURE_RANGE, Math.min(TEMPERATURE_RANGE, Math.round(p.amount))),
    }
  }
  if (filter === 'tint') {
    const p = params as TintParams
    return {
      amount: Math.max(-TINT_RANGE, Math.min(TINT_RANGE, Math.round(p.amount))),
    }
  }
  if (filter === 'vibrance') {
    const p = params as VibranceParams
    return {
      amount: Math.max(-VIBRANCE_RANGE, Math.min(VIBRANCE_RANGE, Math.round(p.amount))),
    }
  }
  if (filter === 'sharpness') {
    const p = params as SharpnessParams
    return {
      amount: Math.max(-SHARPNESS_RANGE, Math.min(SHARPNESS_RANGE, Math.round(p.amount))),
    }
  }
  return clampBlur(params as BlurParams)
}

export interface AdjustmentPipelineStep {
  filter: AdjustmentFilterKind
  params: AdjustmentParams
  presetKey?: string
}

const expandPipelineStep = (step: AdjustmentPipelineStep): AdjustmentPipelineStep[] => {
  const params = clampParams(step.filter, step.params)
  if (step.filter !== 'hsb' || step.presetKey) {
    return [
      { filter: step.filter, params, ...(step.presetKey ? { presetKey: step.presetKey } : {}) },
    ]
  }
  const p = params as HsbParams
  const steps: AdjustmentPipelineStep[] = []
  if (p.hue !== 0) {
    steps.push({ filter: 'hue', params: { hue: p.hue, saturation: 0, brightness: 0 } })
  }
  if (p.saturation !== 0) {
    steps.push({
      filter: 'saturation',
      params: { hue: 0, saturation: p.saturation, brightness: 0 },
    })
  }
  if (p.brightness !== 0) {
    steps.push({
      filter: 'brightness',
      params: { hue: 0, saturation: 0, brightness: p.brightness },
    })
  }
  return steps
}

export const getAdjustmentPipeline = (spec: AdjustmentSpec): AdjustmentPipelineStep[] => {
  if (Array.isArray(spec.pipeline)) {
    if (spec.pipeline.length === 0) return []
    return spec.pipeline.flatMap(expandPipelineStep)
  }
  return expandPipelineStep({ filter: spec.filter, params: spec.params })
}

export const specFromPipeline = (
  spec: AdjustmentSpec,
  pipeline: AdjustmentPipelineStep[],
  editFilter?: AdjustmentFilterKind
): AdjustmentSpec => {
  const steps = pipeline.map((step) => ({
    filter: step.filter,
    params: clampParams(step.filter, step.params),
    ...(step.presetKey ? { presetKey: step.presetKey } : {}),
  }))
  if (!steps.length) {
    return { ...spec, pipeline: [] }
  }
  const primary = (editFilter && steps.find((s) => s.filter === editFilter)) ?? steps[0]
  return {
    ...spec,
    filter: primary.filter,
    params: { ...primary.params },
    pipeline: steps,
  }
}
