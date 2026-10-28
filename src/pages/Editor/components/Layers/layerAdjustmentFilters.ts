import type {
  AdjustmentFilterKind,
  AdjustmentParams,
  BlurParams,
  HsbParams,
  ToneCurveParams,
  TemperatureParams,
  TintParams,
  VibranceParams,
  SharpnessParams,
} from './layerAdjustmentTypes'
import { clampParams, SHARPNESS_RANGE } from './layerAdjustmentTypes'

const rgbaToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      default:
        h = ((r - g) / d + 4) / 6
    }
  }
  return [h * 360, s * 100, l * 100]
}

const hueToRgb = (t1: number, t2: number, hue: number): number => {
  if (hue < 0) hue += 6
  if (hue >= 6) hue -= 6
  if (hue < 1) return (t2 - t1) * hue + t1
  if (hue < 3) return t2
  if (hue < 4) return (t2 - t1) * (4 - hue) + t1
  return t1
}

const hslToRgba = (h: number, s: number, l: number): [number, number, number] => {
  s /= 100
  l /= 100
  let t2: number
  const hue = h / 60
  if (l <= 0.5) t2 = l * (s + 1)
  else t2 = l + s - l * s
  const t1 = l * 2 - t2
  return [
    Math.round(hueToRgb(t1, t2, hue + 2) * 255),
    Math.round(hueToRgb(t1, t2, hue) * 255),
    Math.round(hueToRgb(t1, t2, hue - 2) * 255),
  ]
}

export const applyHsbToImageData = (imageData: ImageData, params: HsbParams): void => {
  const p = clampParams('hsb', params) as HsbParams
  if (p.hue === 0 && p.saturation === 0 && p.brightness === 0) return
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a === 0) continue
    let [h, s, l] = rgbaToHsl(data[i], data[i + 1], data[i + 2])
    h = (((h + p.hue) % 360) + 360) % 360
    if (p.hue !== 0) s = Math.max(s, Math.min(65, Math.abs(p.hue) * 0.45))
    s = Math.max(0, Math.min(100, s + p.saturation))
    l = Math.max(0, Math.min(100, l + p.brightness))
    const [r, g, b] = hslToRgba(h, s, l)
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}

const buildToneLut = (amount: number): Uint8Array => {
  const lut = new Uint8Array(256)
  const c = (amount / 100) * 180
  const factor = (259 * (c + 255)) / (255 * (259 - c))
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.max(0, Math.min(255, Math.round(factor * (i - 128) + 128)))
  }
  return lut
}

const applyToneCurveToImageData = (imageData: ImageData, params: ToneCurveParams): void => {
  const p = clampParams('toneCurve', params) as ToneCurveParams
  if (p.amount === 0) return
  const lut = buildToneLut(p.amount)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    data[i] = lut[data[i]]
    data[i + 1] = lut[data[i + 1]]
    data[i + 2] = lut[data[i + 2]]
  }
}

const writeBlurPixel = (
  dest: Uint8ClampedArray,
  idx: number,
  sr: number,
  sg: number,
  sb: number,
  sa: number,
  count: number
) => {
  const alpha = sa / count
  dest[idx + 3] = Math.round(alpha)
  if (sa > 0) {
    dest[idx] = Math.round(sr / sa)
    dest[idx + 1] = Math.round(sg / sa)
    dest[idx + 2] = Math.round(sb / sa)
    return
  }
  dest[idx] = 0
  dest[idx + 1] = 0
  dest[idx + 2] = 0
}

const boxBlurPass = (
  src: Uint8ClampedArray,
  dest: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean
) => {
  const r = Math.max(1, Math.floor(radius))
  const count = r * 2 + 1
  if (horizontal) {
    for (let y = 0; y < height; y++) {
      let sr = 0
      let sg = 0
      let sb = 0
      let sa = 0
      const row = y * width
      for (let k = -r; k <= r; k++) {
        const idx = (row + Math.max(0, Math.min(width - 1, k))) * 4
        const a = src[idx + 3]
        sr += src[idx] * a
        sg += src[idx + 1] * a
        sb += src[idx + 2] * a
        sa += a
      }
      writeBlurPixel(dest, row * 4, sr, sg, sb, sa, count)
      for (let x = 1; x < width; x++) {
        const remove = (row + Math.max(0, x - 1 - r)) * 4
        const add = (row + Math.min(width - 1, x + r)) * 4
        const removeA = src[remove + 3]
        const addA = src[add + 3]
        sr += src[add] * addA - src[remove] * removeA
        sg += src[add + 1] * addA - src[remove + 1] * removeA
        sb += src[add + 2] * addA - src[remove + 2] * removeA
        sa += addA - removeA
        writeBlurPixel(dest, (row + x) * 4, sr, sg, sb, sa, count)
      }
    }
    return
  }
  for (let x = 0; x < width; x++) {
    let sr = 0
    let sg = 0
    let sb = 0
    let sa = 0
    for (let k = -r; k <= r; k++) {
      const idx = (Math.max(0, Math.min(height - 1, k)) * width + x) * 4
      const a = src[idx + 3]
      sr += src[idx] * a
      sg += src[idx + 1] * a
      sb += src[idx + 2] * a
      sa += a
    }
    writeBlurPixel(dest, x * 4, sr, sg, sb, sa, count)
    for (let y = 1; y < height; y++) {
      const remove = (Math.max(0, y - 1 - r) * width + x) * 4
      const add = (Math.min(height - 1, y + r) * width + x) * 4
      const removeA = src[remove + 3]
      const addA = src[add + 3]
      sr += src[add] * addA - src[remove] * removeA
      sg += src[add + 1] * addA - src[remove + 1] * removeA
      sb += src[add + 2] * addA - src[remove + 2] * removeA
      sa += addA - removeA
      writeBlurPixel(dest, (y * width + x) * 4, sr, sg, sb, sa, count)
    }
  }
}

const applyTemperatureToImageData = (imageData: ImageData, params: TemperatureParams): void => {
  const p = clampParams('temperature', params) as TemperatureParams
  if (p.amount === 0) return
  const shift = p.amount * 1.35
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    data[i] = Math.max(0, Math.min(255, Math.round(data[i] + shift)))
    data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2] - shift)))
  }
}

const applyTintToImageData = (imageData: ImageData, params: TintParams): void => {
  const p = clampParams('tint', params) as TintParams
  if (p.amount === 0) return
  const shift = p.amount * 1.2
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    data[i] = Math.max(0, Math.min(255, Math.round(data[i] + shift)))
    data[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1] - shift)))
    data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2] + shift)))
  }
}

const applyVibranceToImageData = (imageData: ImageData, params: VibranceParams): void => {
  const p = clampParams('vibrance', params) as VibranceParams
  if (p.amount === 0) return
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const [h, satStart, l] = rgbaToHsl(data[i], data[i + 1], data[i + 2])
    let s = satStart
    const sat = s / 100
    if (p.amount > 0) {
      s += p.amount * (1 - sat) * sat * 2
    } else {
      s *= 1 + (p.amount / 100) * sat
    }
    s = Math.max(0, Math.min(100, s))
    const [r, g, b] = hslToRgba(h, s, l)
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}

const applySharpnessToImageData = (
  imageData: ImageData,
  params: SharpnessParams,
  pixelScale = 1
): void => {
  const p = clampParams('sharpness', params) as SharpnessParams
  if (p.amount === 0) return
  if (p.amount < 0) {
    const radius = Math.max(1, Math.round((Math.abs(p.amount) / SHARPNESS_RANGE) * 14))
    applyBlurToImageData(imageData, { radius }, pixelScale)
    return
  }
  const original = new Uint8ClampedArray(imageData.data)
  applyBlurToImageData(imageData, { radius: 1 }, pixelScale)
  const strength = (p.amount / SHARPNESS_RANGE) * 1.35
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    if (original[i + 3] === 0) {
      data[i + 3] = 0
      continue
    }
    for (let c = 0; c < 3; c++) {
      const next = original[i + c] + strength * (original[i + c] - data[i + c])
      data[i + c] = Math.max(0, Math.min(255, Math.round(next)))
    }
    data[i + 3] = original[i + 3]
  }
}

const applyBlurToImageData = (imageData: ImageData, params: BlurParams, pixelScale = 1): void => {
  const p = clampParams('blur', params) as BlurParams
  const radius = p.radius * pixelScale
  if (radius < 0.5) return
  const { width, height, data } = imageData
  const tmp = new Uint8ClampedArray(data.length)
  const out = new Uint8ClampedArray(data.length)
  boxBlurPass(data, tmp, width, height, radius, true)
  boxBlurPass(tmp, out, width, height, radius, false)
  boxBlurPass(out, tmp, width, height, radius, true)
  data.set(tmp)
}

export const applyAdjustmentFilter = (
  imageData: ImageData,
  filter: AdjustmentFilterKind,
  params: AdjustmentParams,
  pixelScale = 1
): void => {
  if (filter === 'hsb' || filter === 'hue' || filter === 'saturation' || filter === 'brightness') {
    const p = params as HsbParams
    if (filter === 'hue') applyHsbToImageData(imageData, { ...p, saturation: 0, brightness: 0 })
    else if (filter === 'saturation') {
      applyHsbToImageData(imageData, { ...p, hue: 0, brightness: 0 })
    } else if (filter === 'brightness') {
      applyHsbToImageData(imageData, { ...p, hue: 0, saturation: 0 })
    } else applyHsbToImageData(imageData, p)
  } else if (filter === 'toneCurve') applyToneCurveToImageData(imageData, params as ToneCurveParams)
  else if (filter === 'temperature') {
    applyTemperatureToImageData(imageData, params as TemperatureParams)
  } else if (filter === 'tint') {
    applyTintToImageData(imageData, params as TintParams)
  } else if (filter === 'vibrance') {
    applyVibranceToImageData(imageData, params as VibranceParams)
  } else if (filter === 'sharpness') {
    applySharpnessToImageData(imageData, params as SharpnessParams, pixelScale)
  } else applyBlurToImageData(imageData, params as BlurParams, pixelScale)
}

export const blendWithSelectionMask = (
  original: Uint8ClampedArray,
  filtered: Uint8ClampedArray,
  mask: Uint8Array | null,
  width: number,
  height: number
) => {
  if (!mask) return
  const n = width * height
  for (let i = 0; i < n; i++) {
    const m = mask[i] / 255
    if (m <= 0 || m >= 1) {
      if (m <= 0) {
        const o = i * 4
        filtered[o] = original[o]
        filtered[o + 1] = original[o + 1]
        filtered[o + 2] = original[o + 2]
        filtered[o + 3] = original[o + 3]
      }
      continue
    }
    const o = i * 4
    filtered[o] = Math.round(original[o] * (1 - m) + filtered[o] * m)
    filtered[o + 1] = Math.round(original[o + 1] * (1 - m) + filtered[o + 1] * m)
    filtered[o + 2] = Math.round(original[o + 2] * (1 - m) + filtered[o + 2] * m)
    filtered[o + 3] = Math.max(
      original[o + 3],
      Math.round(original[o + 3] * (1 - m) + filtered[o + 3] * m)
    )
  }
}
