import { describe, expect, it, vi } from 'vitest'
import { drawStrokeSample, normalizeToolDrawParams } from 'utils/canvasUtils'
import { getStrokeRandomRotationOffset } from 'pages/Editor/editorStepMath'
import { TOOL_FRAME_IMAGE } from 'pages/Editor/constants'

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
      getImageData: (x: number, y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(200),
      }),
      putImageData: () => {},
    }
  }
}

const makeCtx = () => {
  const drawn: any[][] = []
  const transforms: string[] = []
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
    drawImage: (...args: any[]) => drawn.push(args),
    translate: () => transforms.push('translate'),
    rotate: () => transforms.push('rotate'),
    scale: (x: number, y: number) => transforms.push(`scale(${x},${y})`),
  }
  return { ctx, drawn, transforms }
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
  strokeDistance: 0,
}

const tool: any = {
  name: 'brush',
  frameType: TOOL_FRAME_IMAGE,
  frameImageName: 'brush-27',
  frameImageFile: { width: 512, height: 512 },
  color: '#3355aa',
  minPxDistanceBetweenFrames: 2,
  sizeToFramesRatio: 1 / 10,
}

describe('Procreate-inspired stamp dynamics', () => {
  it('draws stampCount stamps per placement', () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    try {
      const { ctx, drawn } = makeCtx()
      drawStrokeSample(ctx, sample, { ...tool, stampCount: 3 }, true)
      expect(drawn).toHaveLength(3)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('pulses size sinusoidally with stroke distance', () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    try {
      const widths: number[] = []
      for (const strokeDistance of [0, 25]) {
        const { ctx, drawn } = makeCtx()
        drawStrokeSample(
          ctx,
          { ...sample, strokeDistance },
          { ...tool, sizeCycleAmount: 0.5, strokeCycleLengthPx: 100 },
          true
        )
        widths.push(drawn[0][3])
      }
      expect(widths[0]).toBe(40)
      expect(widths[1]).toBe(60)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('alternates horizontal flip along the stroke', () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    try {
      const first = makeCtx()
      drawStrokeSample(first.ctx, sample, { ...tool, stampFlipAlternate: true }, true)
      expect(first.transforms.filter((t) => t.startsWith('scale'))).toHaveLength(0)
      const second = makeCtx()
      drawStrokeSample(
        second.ctx,
        { ...sample, strokeDistance: 100 },
        { ...tool, stampFlipAlternate: true },
        true
      )
      expect(second.transforms).toContain('scale(-1,1)')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('color pressure', () => {
  function colorAtForce(force: number): string {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    try {
      const { ctx } = makeCtx()
      drawStrokeSample(
        ctx,
        { ...sample, force },
        { ...tool, colorPressureHue: 140, colorPressureSat: 0.6, colorPressureLight: 0.5 },
        true
      )
      return String(ctx.toolImageShape.color)
    } finally {
      vi.unstubAllGlobals()
    }
  }

  it('shifts the stamp colour with pen pressure', () => {
    expect(colorAtForce(0)).not.toBe(colorAtForce(1))
  })

  it('leaves the colour untouched at zero pressure', () => {
    expect(colorAtForce(0)).toBe('#3058a8')
  })
})

describe('per-stroke random rotation and new clamps', () => {
  it('is deterministic for the same stroke start', () => {
    const a = getStrokeRandomRotationOffset(123.4, 56.7, 2.6)
    expect(getStrokeRandomRotationOffset(123.4, 56.7, 2.6)).toBe(a)
    expect(Math.abs(a)).toBeLessThanOrEqual(2.6)
    expect(getStrokeRandomRotationOffset(900, 700, 2.6)).not.toBe(a)
    expect(getStrokeRandomRotationOffset(123.4, 56.7, 0)).toBe(0)
  })

  it('clamps the new drawing parameters', () => {
    const params = normalizeToolDrawParams({
      stampEdgeBoost: 5,
      spacingJitter: 2,
      colorPressureHue: 400,
    } as Parameters<typeof normalizeToolDrawParams>[0])
    expect(params.stampEdgeBoost).toBe(2)
    expect(params.spacingJitter).toBe(1)
    expect(params.colorPressureHue).toBe(180)
  })
})
