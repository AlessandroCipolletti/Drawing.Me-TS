import {
  applyAdjustmentFilter,
  hslToRgba,
  rgbaToHsl,
} from 'pages/Editor/components/Layers/layerAdjustmentFilters'

export type EffectBrushKind = 'saturation' | 'sharpen'

export const isEffectBrushToolName = (name?: string): name is EffectBrushKind =>
  name === 'saturation' || name === 'sharpen'

export const clampSignedIntensity = (value: number): number =>
  Math.max(-100, Math.min(100, Math.round(value || 0)))

/**
 * Effective signed intensity (-1..1) for one dab: pencil pressure grows the
 * magnitude of the base intensity in whichever direction it points.
 */
export const getEffectiveIntensity = (baseIntensity: number, force?: number): number => {
  const base = clampSignedIntensity(baseIntensity) / 100
  if (base === 0) return 0
  const pressure = typeof force === 'number' && force > 0 ? Math.min(1, force) : 0
  const magnitude = Math.min(1, Math.abs(base) + pressure * 0.55 * (1 - Math.abs(base)))
  return Math.sign(base) * magnitude
}

/**
 * Luminance-only unsharp mask: sharpening detail on the luminance channel
 * and scaling RGB by the same factor avoids the coloured halos that
 * per-channel unsharp masking creates around edges.
 */
const applySharpenLuminance = (imageData: ImageData, t: number) => {
  const { width, height, data } = imageData
  const blurredData = new Uint8ClampedArray(data)
  const blurred = { width, height, data: blurredData } as ImageData
  applyAdjustmentFilter(blurred, 'blur', { radius: 2 })
  const amount = t * 3.2
  const threshold = 2
  const luminance = (arr: Uint8ClampedArray, i: number) =>
    0.2126 * arr[i] + 0.7152 * arr[i + 1] + 0.0722 * arr[i + 2]
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const l = luminance(data, i)
    if (l <= 0.5) continue
    const detail = l - luminance(blurredData, i)
    if (Math.abs(detail) <= threshold) continue
    const scale = Math.max(0.1, Math.min(4, 1 + (amount * detail) / l))
    data[i] = Math.max(0, Math.min(255, Math.round(data[i] * scale)))
    data[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1] * scale)))
    data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2] * scale)))
  }
}

const applySaturation = (imageData: ImageData, t: number, weights?: ArrayLike<number> | null) => {
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    if (weights && !(weights[i / 4] > 0)) continue
    const [h, s, l] = rgbaToHsl(data[i], data[i + 1], data[i + 2])
    // Approach 100 asymptotically when saturating, 0 when desaturating, so
    // repeated dabs keep accumulating without harsh clipping. At |t| = 1 a
    // single dab already covers most of the remaining distance.
    const next = t > 0 ? s + (100 - s) * 0.7 * t : s * (1 - 0.7 * Math.abs(t))
    const [r, g, b] = hslToRgba(h, Math.max(0, Math.min(100, next)), l)
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}

/**
 * Apply one effect dab to an ROI. `signedIntensity` is -1..1 (sign selects
 * saturate/desaturate or sharpen/blur); `weights` is an optional per-pixel
 * 0..1 falloff mask — pixels with weight 0 keep their original value.
 */
export const applyEffectBrushToImageData = (
  imageData: ImageData,
  kind: EffectBrushKind,
  signedIntensity: number,
  weights?: ArrayLike<number> | null
): void => {
  const t = Math.max(-1, Math.min(1, signedIntensity || 0))
  if (t === 0) return
  const original = new Uint8ClampedArray(imageData.data)
  if (kind === 'saturation') {
    applySaturation(imageData, t, weights)
  } else if (t > 0) {
    applySharpenLuminance(imageData, t)
  } else {
    // Full-strength blur at |t| = 1: radius grows with intensity so a single
    // pass at -100 is unmistakably blurred, lighter passes stay gentle.
    applyAdjustmentFilter(imageData, 'blur', {
      radius: Math.max(1, Math.round(1 + Math.abs(t) * 15)),
    })
  }
  const data = imageData.data
  const pixelCount = imageData.width * imageData.height
  for (let p = 0; p < pixelCount; p++) {
    const w = weights ? Math.max(0, Math.min(1, weights[p] || 0)) : 1
    const o = p * 4
    if (w <= 0) {
      data[o] = original[o]
      data[o + 1] = original[o + 1]
      data[o + 2] = original[o + 2]
      data[o + 3] = original[o + 3]
      continue
    }
    if (w >= 1) continue
    data[o] = Math.round(original[o] * (1 - w) + data[o] * w)
    data[o + 1] = Math.round(original[o + 1] * (1 - w) + data[o + 1] * w)
    data[o + 2] = Math.round(original[o + 2] * (1 - w) + data[o + 2] * w)
    data[o + 3] = Math.max(original[o + 3], Math.round(original[o + 3] * (1 - w) + data[o + 3] * w))
  }
}

/** Soft circular falloff weights for a square ROI centred on the dab. */
export const buildDabWeights = (
  roiSize: number,
  radius: number,
  out?: Float32Array
): Float32Array => {
  const weights =
    out && out.length === roiSize * roiSize ? out : new Float32Array(roiSize * roiSize)
  const centre = roiSize / 2
  for (let y = 0; y < roiSize; y++) {
    for (let x = 0; x < roiSize; x++) {
      const d = Math.hypot(x + 0.5 - centre, y + 0.5 - centre) / radius
      if (d >= 1) {
        weights[y * roiSize + x] = 0
      } else {
        const f = 1 - d
        weights[y * roiSize + x] = f * f * (3 - 2 * f)
      }
    }
  }
  return weights
}
