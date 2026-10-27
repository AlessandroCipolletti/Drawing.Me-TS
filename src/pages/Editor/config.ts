export type StampSpacingMode = 'bySize' | 'fixed'

/** How per-stamp colour variation is applied: constant colour, deterministic
 * random per stamp, or a cyclic light→dark→light gradient along the stroke. */
export type ColorVariationMode = 'off' | 'random' | 'cycle'

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
  sizeTangentialFactor: number
  alpha: number
  minAlpha: number
  maxAlpha: number
  alphaForceFactor: number
  alphaSpeedFactor: number
  alphaAltitudeFactor: number
  alphaTangentialFactor: number
  forceCurve: number
  altitudeCurve: number
  /** Gamma response curve (0..N, default 1) applied to pointer speedFactor when speed factors are non-zero. */
  speedCurve: number
  speedSmoothing: number
  useTimeBasedSpeed: boolean
  maxVelocityPxPerMs: number
  stabilization: number
  aspectRatio: number
  minAspectRatio: number
  maxAspectRatio: number
  aspectAltitudeFactor: number
  aspectForceFactor: number
  jitterPosition: number
  jitterSize: number
  jitterAlpha: number
  jitterRotation: number
  /** Deterministic per-stamp relative aspect ratio jitter factor (0..N, default 0). */
  jitterAspectRatio: number
  /** Start-of-stroke taper factor (0..1, default 0 = no start taper). */
  startTaperFactor: number
  endTaperFactor: number
  /** Fractional size reduction at full taper (0..1, default 0.3). */
  endTaperSizeAmount: number
  /** Gamma curve applied to taper alpha interpolation (0..N, default 1 = linear). */
  endTaperAlphaCurve: number
  completeEndSegment: boolean
  preserveStampRemainder: boolean
  usePredictedEvents: boolean
  /** Opacity multiplier (0..1, default 1) for predicted-events overlay only. */
  predictedEventsBlend: number
  /** Stamp spacing mode: 'bySize' uses size * sizeToFramesRatio; 'fixed' uses stampSpacingFixedPx. */
  stampSpacingMode: StampSpacingMode
  /** Fixed pixel spacing between stamps when stampSpacingMode is 'fixed' (default 1). */
  stampSpacingFixedPx: number
  sizeToFramesRatio: number
  minPxDistanceBetweenFrames: number
  /** Soft shadow blur radius in px for circle stamps (0..32, default 0). */
  stampBlur: number
  /** Per-stamp X scale multiplier (default 1). */
  stampScaleX: number
  /** Per-stamp Y scale multiplier (default 1). */
  stampScaleY: number
  /** Per-stamp alpha flow multiplier (0..1, default 1). */
  flow: number
  /** Along-segment alpha buildup factor from t=0 to t=1 (0..1, default 0 = uniform). */
  buildup: number
  /** Density multiplier for particle stamps (default 1). */
  particleDensity: number
  /** Density multiplier for spray stamps (default 1). */
  sprayDensity: number
  /** Radius multiplier for spray stamps (default 1). */
  sprayRadiusFactor: number
  /** Deterministic per-stamp hue jitter in degrees (0..180, default 0). */
  colorJitterHue: number
  /** Deterministic per-stamp saturation jitter factor (0..1, default 0). */
  colorJitterSat: number
  /** Deterministic per-stamp lightness jitter factor (0..1, default 0). */
  colorJitterLight: number
  /** Colour variation strategy (default 'random'); amounts above are the range. */
  colorVariationMode: ColorVariationMode
  /** Px of stroke needed to go from the lightest to the darkest tint in 'cycle' mode. */
  colorCycleLengthPx: number
  /** Optional second colour stamps mix toward ('' = none). */
  secondaryColor: string
  /** Maximum mix toward the secondary colour per stamp (0..1, default 0). */
  colorSecondaryMix: number
  /** Stamps drawn at each placement (1..8, Procreate Shape Count). */
  stampCount: number
  /** Randomizes the effective count between 1 and stampCount (0..1). */
  stampCountJitter: number
  /** Random offset radius, as a size factor, for multi-stamps (0..2). */
  stampScatter: number
  stampFlipX: boolean
  stampFlipY: boolean
  /** Alternates the horizontal flip stamp after stamp along the stroke. */
  stampFlipAlternate: boolean
  /** Snaps stamp rotation to multiples of this angle in radians (0 = off). */
  stampRotationSnap: number
  /** Alpha below this threshold is cut, above is kept solid (0 = off, crisp stamps). */
  stampAlphaThreshold: number
  /** Sinusoidal size modulation along the stroke (0..0.9). */
  sizeCycleAmount: number
  /** Sinusoidal alpha modulation along the stroke (0..0.9). */
  alphaCycleAmount: number
  /** Px period of the size/alpha stroke cycles. */
  strokeCycleLengthPx: number
  /** Sinusoidal side-to-side offset, as a size factor (0..1). */
  wobbleAmount: number
  /** Px period of the wobble. */
  wobbleLengthPx: number
  /** Hue shift driven by stylus pressure across the stroke (0..180, Color Pressure). */
  colorPressureHue: number
  /** Saturation shift driven by stylus pressure (0..1). */
  colorPressureSat: number
  /** Lightness shift driven by stylus pressure (0..1). */
  colorPressureLight: number
  /** Random rotation offset chosen once per stroke (radians, Shape Randomized). */
  stampStrokeRandomRotation: number
  /** Randomizes the distance between stamps (0..1, Stroke Path Spacing Jitter). */
  spacingJitter: number
  /** Boosts semi-transparent rim alpha in the tinted frame (0..2, burnt/wet edges). */
  stampEdgeBoost: number
  degradeAlphaBySize: boolean
  /**
   * When true and the selected opacity is at its maximum (100%), every frame of
   * the stroke is drawn at opacity 1 instead of the pressure/speed/tilt formula.
   */
  opaqueFramesAtMaxAlpha: boolean
  showVersionPreview: boolean
  frameType: string | false
  frameImageName: string | false
  frameImageFile: HTMLImageElement | ImageBitmap | HTMLCanvasElement | null
  handleStylusRotation: boolean
  handleStylusTwist: boolean
  handlePathRotation: boolean
  /** Weight (0..1, default 1) applied to path direction rotation when handlePathRotation is true. */
  pathRotationWeight: number
  /** Smoothing factor (0..1, default 0) applied to shortest-arc step rotation deltas. */
  rotationSmoothing: number
  /** Static rotation offset in radians added to each stamp before jitter (default 0). */
  stampRotationOffset: number
  /** Minimum stylus altitudeFactor required to track azimuth rotation (0..1, default 0.3). */
  minAltitudeFactorToHandleRotation: number
  globalCompositeOperation?: GlobalCompositeOperation
  /** Optional per-stamp composite operation override (default undefined = use stroke GCO). */
  stampCompositeOperation?: GlobalCompositeOperation
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
  sizeTangentialFactor: 0,

  alpha: 0.3,
  minAlpha: 0.01,
  maxAlpha: 1,
  alphaForceFactor: 0,
  alphaSpeedFactor: 0,
  alphaAltitudeFactor: 0,
  alphaTangentialFactor: 0,

  forceCurve: 1,
  altitudeCurve: 1,
  speedCurve: 1,
  speedSmoothing: 0,
  useTimeBasedSpeed: false,
  maxVelocityPxPerMs: 2.5,
  stabilization: 0,

  aspectRatio: 1,
  minAspectRatio: 0.2,
  maxAspectRatio: 5,
  aspectAltitudeFactor: 0,
  aspectForceFactor: 0,

  jitterPosition: 0,
  jitterSize: 0,
  jitterAlpha: 0,
  jitterRotation: 0,
  jitterAspectRatio: 0,

  startTaperFactor: 0,
  endTaperFactor: 1,
  endTaperSizeAmount: 0.3,
  endTaperAlphaCurve: 1,
  completeEndSegment: false,
  preserveStampRemainder: false,
  usePredictedEvents: false,
  predictedEventsBlend: 1,

  stampSpacingMode: 'bySize',
  stampSpacingFixedPx: 1,
  sizeToFramesRatio: 1,
  minPxDistanceBetweenFrames: 1,

  stampBlur: 0,
  stampScaleX: 1,
  stampScaleY: 1,
  flow: 1,
  buildup: 0,
  particleDensity: 1,
  sprayDensity: 1,
  sprayRadiusFactor: 1,

  colorJitterHue: 0,
  colorJitterSat: 0,
  colorJitterLight: 0,
  colorVariationMode: 'random',
  colorCycleLengthPx: 240,
  secondaryColor: '',
  colorSecondaryMix: 0,
  stampCount: 1,
  stampCountJitter: 0,
  stampScatter: 0,
  stampFlipX: false,
  stampFlipY: false,
  stampFlipAlternate: false,
  stampRotationSnap: 0,
  stampAlphaThreshold: 0,
  sizeCycleAmount: 0,
  alphaCycleAmount: 0,
  strokeCycleLengthPx: 160,
  wobbleAmount: 0,
  wobbleLengthPx: 120,
  colorPressureHue: 0,
  colorPressureSat: 0,
  colorPressureLight: 0,
  stampStrokeRandomRotation: 0,
  spacingJitter: 0,
  stampEdgeBoost: 0,

  degradeAlphaBySize: false,
  opaqueFramesAtMaxAlpha: false,
  showVersionPreview: false,
  frameType: false,
  frameImageName: false,
  frameImageFile: null,
  handleStylusRotation: false,
  handleStylusTwist: false,
  handlePathRotation: false,
  pathRotationWeight: 1,
  rotationSmoothing: 0,
  stampRotationOffset: 0,
  minAltitudeFactorToHandleRotation: 0.3,
  stampCompositeOperation: undefined,
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
  maxCanvasSize: 8192,
  canvasScaleWithGoodPerformance: 1,
  minAltitudeFactorToHandleRotation: 0.3,
  resizeRotationStep: 2.5,
  resizeRotationInterval: 45,
  draftInfoDuration: 3_000,
}
