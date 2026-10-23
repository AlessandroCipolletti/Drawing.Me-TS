import tinycolor from 'tinycolor2'
import { getRandomNumber, round } from 'utils/mathUtils'

const SUGGESTED_COLORS = 6 + 1

export interface RgbaColor {
  r: number
  g: number
  b: number
  a?: number
}

const rgbaStringToRgba = (rgbaString: string): RgbaColor => {
  const [r, g, b, a] = rgbaString
    .substring(rgbaString.indexOf('(') + 1)
    .replace(')', '')
    .replaceAll(' ', '')
    .split(',')
  return {
    r: parseInt(r, 10),
    g: parseInt(g, 10),
    b: parseInt(b, 10),
    a: typeof a !== 'undefined' ? parseFloat(a) : 1,
  }
}

const hexToRgba = (hex: string): RgbaColor => ({
  r: parseInt(hex.substring(0, 2), 16),
  g: parseInt(hex.substring(2, 4), 16),
  b: parseInt(hex.substring(4, 6), 16),
  a: round(parseInt(hex.substring(6, 8), 16) / 255, 0) || 1,
})

export const rgbToHex = (r: number, g: number, b: number, _a?: number): string =>
  `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`

export const compareRgbColorsWithinTollerance = (
  rgb1: RgbaColor,
  rgb2: RgbaColor,
  tolerance: number
): boolean => {
  return !(
    Math.abs(rgb1.r - rgb2.r) > tolerance ||
    Math.abs(rgb1.g - rgb2.g) > tolerance ||
    Math.abs(rgb1.b - rgb2.b) > tolerance
  )
}

const hueToRgb = (t1: number, t2: number, hue: number): number => {
  if (hue < 0) hue += 6
  if (hue >= 6) hue -= 6
  if (hue < 1) return (t2 - t1) * hue + t1
  else if (hue < 3) return t2
  else if (hue < 4) return (t2 - t1) * (4 - hue) + t1
  else return t1
}

const hslaToRgba = (hue: number, sat: number, light: number, a?: number): RgbaColor => {
  sat = round(sat / 100, 2)
  light = round(light / 100, 2)
  let t2: number
  hue = hue / 60
  if (light <= 0.5) {
    t2 = light * (sat + 1)
  } else {
    t2 = light + sat - light * sat
  }
  const t1 = light * 2 - t2
  const r = round(hueToRgb(t1, t2, hue + 2) * 255, 0)
  const g = round(hueToRgb(t1, t2, hue) * 255, 0)
  const b = round(hueToRgb(t1, t2, hue - 2) * 255, 0)

  return { r, g, b, a }
}

const rgbaToHsla = (r: number, g: number, b: number, a?: number) => {
  const rgb = [r / 255, g / 255, b / 255]
  let min = rgb[0]
  let max = rgb[0]
  let maxcolor = 0
  for (let i = 0; i < rgb.length - 1; i++) {
    if (rgb[i + 1] <= min) {
      min = rgb[i + 1]
    }
    if (rgb[i + 1] >= max) {
      max = rgb[i + 1]
      maxcolor = i + 1
    }
  }
  let h = 0
  if (maxcolor === 0) {
    h = (rgb[1] - rgb[2]) / (max - min)
  }
  if (maxcolor === 1) {
    h = 2 + (rgb[2] - rgb[0]) / (max - min)
  }
  if (maxcolor === 2) {
    h = 4 + (rgb[0] - rgb[1]) / (max - min)
  }
  if (isNaN(h)) h = 0
  h = h * 60
  if (h < 0) h = h + 360
  const l = (min + max) / 2
  let s: number
  if (min === max) {
    s = 0
  } else {
    if (l < 0.5) {
      s = (max - min) / (max + min)
    } else {
      s = (max - min) / (2 - max - min)
    }
  }
  return {
    h: round(h, 0),
    s: round(s * 100, 0),
    l: round(l * 100, 0),
    a,
  }
}

const hslaStringToRgba = (hslaString: string): RgbaColor => {
  const [h, s, l, a] = hslaString
    .substring(hslaString.indexOf('(') + 1)
    .replace(')', '')
    .replaceAll(' ', '')
    .split(',')
  return hslaToRgba(
    parseFloat(h),
    parseFloat(s),
    parseFloat(l),
    typeof a !== 'undefined' ? parseFloat(a) : 1
  )
}

export const getRandomHexColor = (): string =>
  rgbToHex(getRandomNumber(256), getRandomNumber(256), getRandomNumber(256))

export const colorStringToRgb = (colorString: string | RgbaColor): RgbaColor => {
  if (typeof colorString !== 'string') {
    return colorString
  }
  if (colorString.startsWith('#')) {
    return hexToRgba(colorString.substring(1))
  } else if (colorString.startsWith('rgb')) {
    return rgbaStringToRgba(colorString)
  } else if (colorString.startsWith('hsl')) {
    return hslaStringToRgba(colorString)
  }
  return { r: 0, g: 0, b: 0, a: 1 }
}

export const applyBrightnessToHex = (hex: string, brightness: number): string => {
  if (hex.startsWith('#')) {
    hex = hex.substring(1)
  }
  const rgb = hexToRgba(hex)
  const hsl = rgbaToHsla(rgb.r, rgb.g, rgb.b)
  const newRgb = hslaToRgba(hsl.h, hsl.s, brightness)
  return rgbToHex(newRgb.r, newRgb.g, newRgb.b)
}

export const swatchNeedsDarkRing = (hex: string): boolean => tinycolor(hex).getLuminance() > 0.72

export const getHexBrightness = (hex: string): number => {
  if (hex.startsWith('#')) {
    hex = hex.substring(1)
  }
  const rgb = hexToRgba(hex)
  const hsl = rgbaToHsla(rgb.r, rgb.g, rgb.b)
  return hsl.l
}

export const getSuggestedColors = (colorHex: string): string[] => {
  const colors: string[] = []
  const base = tinycolor(colorHex)

  for (let i = 1; i < SUGGESTED_COLORS - 1; i++) {
    colors.push(base.spin((360 / SUGGESTED_COLORS) * i).toString())
  }

  return colors
}

export const applyDeterministicColorJitter = (
  color: string | undefined,
  hueJitterDeg: number,
  satJitter: number,
  lightJitter: number,
  uHue: number,
  uSat: number,
  uLight: number
): string | undefined => {
  if (!color || (hueJitterDeg === 0 && satJitter === 0 && lightJitter === 0)) {
    return color
  }
  const rgb = colorStringToRgb(color)
  const hsl = rgbaToHsla(rgb.r, rgb.g, rgb.b, rgb.a)
  const h = (((hsl.h + (uHue - 0.5) * 2 * hueJitterDeg) % 360) + 360) % 360
  const s = Math.max(0, Math.min(100, round(hsl.s + (uSat - 0.5) * 2 * satJitter * 100, 0)))
  const l = Math.max(0, Math.min(100, round(hsl.l + (uLight - 0.5) * 2 * lightJitter * 100, 0)))
  const jittered = hslaToRgba(h, s, l, rgb.a)
  return rgbToHex(jittered.r, jittered.g, jittered.b)
}
