import { describe, expect, it, vi } from 'vitest'
import { drawStrokeSample, getColorCycleFactor } from 'utils/canvasUtils'
import { applyDeterministicColorJitter } from 'utils/colorsUtils'
import { TOOL_FRAME_IMAGE } from 'pages/Editor/constants'
import { getStepData } from 'pages/Editor/editorStepMath'
import { addTouchStepDataKeys, removeTouchStepDataKeys } from 'pages/Editor/editorCoworkingBridge'

class FakeCanvas {
  width = 0
  height = 0
  constructor(w = 0, h = 0) {
    this.width = w
    this.height = h
  }
  getContext(..._args: unknown[]) {
    return {
      fillStyle: '',
      globalCompositeOperation: 'source-over',
      fillRect: () => {},
      clearRect: () => {},
      drawImage: () => {},
    }
  }
}

describe('cyclic colour variation', () => {
  it('sweeps -1 → +1 → -1 over twice the configured length', () => {
    expect(getColorCycleFactor(0, 100)).toBe(-1)
    expect(getColorCycleFactor(50, 100)).toBe(0)
    expect(getColorCycleFactor(100, 100)).toBe(1)
    expect(getColorCycleFactor(150, 100)).toBe(0)
    expect(getColorCycleFactor(200, 100)).toBe(-1)
    expect(getColorCycleFactor(300, 100)).toBe(1)
  })

  it('accumulates stroke distance in step data and on the coworking wire', () => {
    const tool: any = { size: 20, alpha: 0.5, minAlpha: 0.05, maxAlpha: 1 }
    const touch: any = {
      type: 'move',
      x: 30,
      y: 0,
      midX: 15,
      midY: 0,
      stepLength: 30,
    }
    expect(getStepData(tool, { ...touch, type: 'start', stepLength: 0 }, {}).strokeDistance).toBe(0)
    expect(getStepData(tool, touch, { strokeDistance: 30 }).strokeDistance).toBe(60)
    const decoded = addTouchStepDataKeys(
      JSON.parse(JSON.stringify(removeTouchStepDataKeys({ ...touch, strokeDistance: 60 })))
    )
    expect(decoded.strokeDistance).toBe(60)
  })

  it('keeps even maximum excursion away from white, black and grey', () => {
    const channels = (hex?: string) => {
      const v = parseInt((hex || '#000000').slice(1), 16)
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
    }
    const darkest = channels(applyDeterministicColorJitter('#d43a2a', 0, 1, 1, 0.5, 0, 0))
    const lightest = channels(applyDeterministicColorJitter('#d43a2a', 0, 1, 1, 0.5, 1, 1))
    for (const rgb of [darkest, lightest]) {
      // Neither pure white/black (all channels at an extreme) nor grey.
      expect(Math.max(...rgb) - Math.min(...rgb)).toBeGreaterThan(15)
    }
    expect(Math.min(...darkest)).toBeGreaterThan(0)
    expect(Math.min(...lightest)).toBeLessThan(250)
    const neutral = channels(applyDeterministicColorJitter('#d43a2a', 0, 0, 1, 0.5, 0.5, 0.5))
    expect(Math.abs(neutral[0] - 0xd4)).toBeLessThanOrEqual(2)
  })

  it('tints stamps along a continuous light→dark→light gradient, not randomly', () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    try {
      const shapeCanvas = new FakeCanvas(300, 300)
      const ctx: any = {
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        lastDrawCoordX: -1,
        lastDrawCoordY: -1,
        toolImageShape: {
          frameImageName: '',
          color: '',
          canvas: shapeCanvas,
          context: shapeCanvas.getContext('2d'),
          cache: new Map(),
          scaledCache: new Map(),
        },
        drawImage: () => {},
        translate: () => {},
        rotate: () => {},
      }
      const tool: any = {
        name: 'brush',
        frameType: TOOL_FRAME_IMAGE,
        frameImageName: 'brush-16',
        frameImageFile: { width: 512, height: 512 },
        color: '#7f7f7f',
        colorJitterLight: 0.4,
        colorVariationMode: 'cycle',
        colorCycleLengthPx: 100,
        minPxDistanceBetweenFrames: 2,
        sizeToFramesRatio: 1 / 32,
      }
      const baseSample: any = {
        type: 'start',
        x: 10,
        y: 10,
        midX: 10,
        midY: 10,
        size: 40,
        alpha: 0.5,
        rotation: 0,
        oldSize: 40,
        oldAlpha: 0.5,
        oldRotation: 0,
        oldMidX: 10,
        oldMidY: 10,
        oldX: 10,
        oldY: 10,
        stepLength: 0,
        aspectRatio: 1,
      }
      const reds: number[] = []
      for (const strokeDistance of [0, 50, 100, 150, 200]) {
        drawStrokeSample(ctx, { ...baseSample, strokeDistance }, tool, true)
        reds.push(parseInt(ctx.toolImageShape.color.slice(1, 3), 16))
      }
      expect(reds[0]).toBeLessThan(reds[1])
      expect(reds[1]).toBeLessThan(reds[2])
      expect(reds[3]).toBe(reds[1])
      expect(reds[4]).toBe(reds[0])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('moves through finely quantized cached tints along the cycle', () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    try {
      const shapeCanvas = new FakeCanvas(300, 300)
      const ctx: any = {
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        lastDrawCoordX: -1,
        lastDrawCoordY: -1,
        toolImageShape: {
          frameImageName: '',
          color: '',
          canvas: shapeCanvas,
          context: shapeCanvas.getContext('2d'),
          cache: new Map(),
          scaledCache: new Map(),
        },
        drawImage: () => {},
        translate: () => {},
        rotate: () => {},
      }
      const tool: any = {
        name: 'brush',
        frameType: TOOL_FRAME_IMAGE,
        frameImageName: 'brush-14',
        frameImageFile: { width: 512, height: 512 },
        color: '#b03030',
        colorJitterLight: 1,
        colorVariationMode: 'cycle',
        colorCycleLengthPx: 500,
        minPxDistanceBetweenFrames: 1.5,
        sizeToFramesRatio: 1 / 85,
      }
      const sample: any = {
        type: 'start',
        x: 10,
        y: 10,
        midX: 10,
        midY: 10,
        size: 40,
        alpha: 0.5,
        rotation: 0,
        oldSize: 40,
        oldAlpha: 0.5,
        oldRotation: 0,
        oldMidX: 10,
        oldMidY: 10,
        oldX: 10,
        oldY: 10,
        stepLength: 0,
        aspectRatio: 1,
      }
      const tints: string[] = []
      for (const strokeDistance of [100, 150, 200, 250]) {
        drawStrokeSample(ctx, { ...sample, strokeDistance }, tool, true)
        tints.push(ctx.toolImageShape.color)
      }
      expect(new Set(tints).size).toBe(tints.length)
      // Only the handful of tints visited so far is cached, not one per stamp.
      expect(ctx.toolImageShape.cache.size).toBeLessThanOrEqual(6)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
