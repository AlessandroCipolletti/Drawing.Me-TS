import { describe, expect, it } from 'vitest'
import {
  applyAdjustmentFilter,
  applyHsbToImageData,
  blendWithSelectionMask,
} from 'pages/Editor/components/Layers/layerAdjustmentFilters'

const solidImage = (r: number, g: number, b: number, a = 255) => {
  const data = new Uint8ClampedArray(4 * 4)
  for (let i = 0; i < 4; i++) {
    const o = i * 4
    data[o] = r
    data[o + 1] = g
    data[o + 2] = b
    data[o + 3] = a
  }
  return { width: 2, height: 2, data } as ImageData
}

describe('layerAdjustmentFilters', () => {
  it('leaves pixels unchanged at neutral HSB', () => {
    const img = solidImage(100, 150, 200)
    applyHsbToImageData(img, { hue: 0, saturation: 0, brightness: 0 })
    expect([...img.data.slice(0, 4)]).toEqual([100, 150, 200, 255])
  })

  it('shifts gray warmer when temperature is positive', () => {
    const img = solidImage(80, 80, 80)
    applyAdjustmentFilter(img, 'temperature', { amount: 40 })
    expect(img.data[0]).toBeGreaterThan(80)
    expect(img.data[2]).toBeLessThan(80)
  })

  it('keeps a downscaled blur narrower than the full-size radius', () => {
    const edge = () => {
      const data = new Uint8ClampedArray(32 * 4)
      data[0] = data[1] = data[2] = data[3] = 255
      return { width: 32, height: 1, data } as ImageData
    }
    const full = edge()
    const preview = edge()
    applyAdjustmentFilter(full, 'blur', { radius: 8 })
    applyAdjustmentFilter(preview, 'blur', { radius: 8 }, 0.25)
    expect(preview.data[28]).toBeLessThan(full.data[28])
  })

  it('softens neighboring pixels toward each other', () => {
    const data = new Uint8ClampedArray([40, 40, 40, 255, 200, 200, 200, 255])
    const img = { width: 2, height: 1, data } as ImageData
    applyAdjustmentFilter(img, 'sharpness', { amount: -40 })
    expect(img.data[0]).toBeGreaterThan(40)
    expect(img.data[4]).toBeLessThan(200)
  })

  it('respects selection mask blending', () => {
    const img = solidImage(50, 50, 50)
    const original = new Uint8ClampedArray(img.data)
    applyAdjustmentFilter(img, 'toneCurve', { amount: 40 })
    const mask = new Uint8Array(4)
    mask[0] = 255
    mask[1] = 0
    mask[2] = 0
    mask[3] = 0
    blendWithSelectionMask(original, img.data, mask, 2, 2)
    expect([...img.data.slice(0, 4)]).not.toEqual([...original.slice(0, 4)])
    expect([...img.data.slice(4, 8)]).toEqual([...original.slice(4, 8)])
  })
})
