import { describe, expect, it } from 'vitest'
import { rgbaToHsl } from 'pages/Editor/components/Layers/layerAdjustmentFilters'
import {
  applyEffectBrushToImageData,
  buildDabWeights,
  clampSignedIntensity,
  getEffectiveIntensity,
} from 'pages/Editor/effectBrushFilters'
import { isQuickShapeSupportedTool } from 'pages/Editor/editorQuickShape'
import { resolveTouchStartAction } from 'pages/Editor/editorPointerRouter'
import { TOUCH_TYPE_FINGER } from 'main/constants'

const makeImage = (width: number, height: number, fill: [number, number, number, number]) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let p = 0; p < width * height; p++) {
    data.set(fill, p * 4)
  }
  return { width, height, data } as ImageData
}

const saturationOf = (img: ImageData, pixel = 0): number => {
  const o = pixel * 4
  return rgbaToHsl(img.data[o], img.data[o + 1], img.data[o + 2])[1]
}

describe('effectBrushFilters', () => {
  it('saturates with positive intensity and desaturates with negative', () => {
    const sat = makeImage(2, 2, [180, 140, 140, 255])
    const before = saturationOf(sat)
    applyEffectBrushToImageData(sat, 'saturation', 1)
    expect(saturationOf(sat)).toBeGreaterThan(before)

    const desat = makeImage(2, 2, [180, 140, 140, 255])
    applyEffectBrushToImageData(desat, 'saturation', -1)
    expect(saturationOf(desat)).toBeLessThan(before)
  })

  it('accumulates over repeated applications', () => {
    const img = makeImage(2, 2, [180, 140, 140, 255])
    const start = saturationOf(img)
    applyEffectBrushToImageData(img, 'saturation', 0.6)
    const once = saturationOf(img)
    applyEffectBrushToImageData(img, 'saturation', 0.6)
    expect(once).toBeGreaterThan(start)
    expect(saturationOf(img)).toBeGreaterThan(once)
  })

  it('is a no-op at zero intensity and leaves transparent pixels untouched', () => {
    const img = makeImage(2, 1, [180, 140, 140, 255])
    img.data.set([200, 50, 50, 0], 4)
    const before = [...img.data]
    applyEffectBrushToImageData(img, 'saturation', 0)
    expect([...img.data]).toEqual(before)
    applyEffectBrushToImageData(img, 'saturation', 1)
    expect([...img.data.slice(4)]).toEqual([200, 50, 50, 0])
  })

  it('blurs with negative sharpen intensity and sharpens with positive', () => {
    const edge = () => {
      const img = makeImage(8, 1, [40, 40, 40, 255])
      for (let p = 4; p < 8; p++) img.data.set([200, 200, 200, 255], p * 4)
      return img
    }
    const blurred = edge()
    applyEffectBrushToImageData(blurred, 'sharpen', -1)
    expect(blurred.data[3 * 4]).toBeGreaterThan(40)
    expect(blurred.data[4 * 4]).toBeLessThan(200)

    const sharpened = edge()
    applyEffectBrushToImageData(sharpened, 'sharpen', 1)
    expect(sharpened.data[3 * 4]).toBeLessThanOrEqual(40)
    expect(sharpened.data[4 * 4]).toBeGreaterThanOrEqual(200)
  })

  it('sharpens luminance without shifting hue on a coloured edge', () => {
    const img = makeImage(8, 1, [120, 40, 40, 255])
    for (let p = 4; p < 8; p++) img.data.set([220, 90, 90, 255], p * 4)
    const hueBefore = rgbaToHsl(220, 90, 90)[0]
    applyEffectBrushToImageData(img, 'sharpen', 1)
    const o = 4 * 4
    const hueAfter = rgbaToHsl(img.data[o], img.data[o + 1], img.data[o + 2])[0]
    expect(Math.abs(hueAfter - hueBefore)).toBeLessThan(2)
    expect(img.data[o]).toBeGreaterThanOrEqual(220)
  })

  it('respects the falloff weights: weight 0 keeps the original pixel', () => {
    const img = makeImage(3, 1, [180, 140, 140, 255])
    const weights = new Float32Array([0, 1, 0])
    applyEffectBrushToImageData(img, 'saturation', 1, weights)
    expect(saturationOf(img, 0)).toBeCloseTo(saturationOf(makeImage(1, 1, [180, 140, 140, 255])), 0)
    expect(saturationOf(img, 1)).toBeGreaterThan(saturationOf(img, 0))
    expect(saturationOf(img, 2)).toBeCloseTo(saturationOf(img, 0), 0)
  })

  it('builds dab weights that are 1 at the centre and 0 outside the radius', () => {
    const weights = buildDabWeights(21, 10)
    expect(weights[10 * 21 + 10]).toBeCloseTo(1, 1)
    expect(weights[0]).toBe(0)
  })
})

describe('effect intensity semantics', () => {
  it('pressure grows magnitude in both directions, never at zero', () => {
    expect(getEffectiveIntensity(40, 0)).toBeCloseTo(0.4)
    expect(getEffectiveIntensity(40, 1)).toBeGreaterThan(0.4)
    expect(getEffectiveIntensity(-40, 1)).toBeLessThan(-0.4)
    expect(getEffectiveIntensity(-40, 0)).toBeCloseTo(-0.4)
    expect(getEffectiveIntensity(0, 1)).toBe(0)
    expect(getEffectiveIntensity(100, 1)).toBe(1)
    expect(getEffectiveIntensity(-100, 1)).toBe(-1)
  })

  it('clamps the stored signed intensity to -100..100', () => {
    expect(clampSignedIntensity(140)).toBe(100)
    expect(clampSignedIntensity(-140)).toBe(-100)
    expect(clampSignedIntensity(10)).toBe(10)
  })
})

describe('effect tool integration', () => {
  it('excludes saturation and sharpen from quick shape', () => {
    expect(
      isQuickShapeSupportedTool({ name: 'saturation', globalCompositeOperation: 'source-over' })
    ).toBe(false)
    expect(
      isQuickShapeSupportedTool({ name: 'sharpen', globalCompositeOperation: 'source-over' })
    ).toBe(false)
  })

  it('routes effect-tool finger touches to step, not dragZoom, on stylus devices', () => {
    for (const toolName of ['saturation', 'sharpen']) {
      expect(
        resolveTouchStartAction({
          isResizing: false,
          resizeModeActive: false,
          currentDeviceHasStylus: true,
          touchType: TOUCH_TYPE_FINGER,
          hasZoom: true,
          toolName,
          currentLayerIsActive: true,
        })
      ).toBe('step')
    }
  })
})
