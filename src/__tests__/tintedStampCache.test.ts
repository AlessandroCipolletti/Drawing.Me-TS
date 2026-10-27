import { describe, expect, it, vi } from 'vitest'
import { drawStrokeSample, setImageShapeIfNeeded } from 'utils/canvasUtils'
import { TOOL_FRAME_IMAGE } from 'pages/Editor/constants'

class FakeCanvas {
  static instances: FakeCanvas[] = []
  width = 0
  height = 0
  tintCount = 0
  constructor(w = 0, h = 0) {
    this.width = w
    this.height = h
    FakeCanvas.instances.push(this)
  }
  getContext(..._args: unknown[]) {
    return {
      fillStyle: '',
      globalCompositeOperation: 'source-over',
      fillRect: () => {
        this.tintCount++
      },
      drawImage: () => {},
    }
  }
}

const makeCtx = () => {
  const shapeCanvas = new FakeCanvas(300, 300) as unknown as HTMLCanvasElement
  return {
    toolImageShape: {
      frameImageName: '',
      color: '',
      canvas: shapeCanvas,
      context: shapeCanvas.getContext('2d'),
      cache: new Map(),
    },
  } as any
}

describe('tinted stamp cache', () => {
  it('tints each colour once and reuses variants when colours alternate', () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    try {
      const ctx = makeCtx()
      const image = { width: 512, height: 512 } as HTMLImageElement
      const colors = ['#102030', '#405060']
      for (let i = 0; i < 50; i++) {
        setImageShapeIfNeeded(ctx, image, 'brush-14', colors[i % 2])
      }
      const variants = [...ctx.toolImageShape.cache.values()] as unknown as FakeCanvas[]
      expect(variants).toHaveLength(2)
      expect(variants.reduce((sum, c) => sum + c.tintCount, 0)).toBe(2)
      expect(ctx.toolImageShape.color).toBe(colors[1])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('pre-scales the tinted stamp once per size bucket and stamps from it', () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    FakeCanvas.instances = []
    try {
      const drawn: unknown[] = []
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
        drawImage: (img: unknown) => drawn.push(img),
        translate: () => {},
        rotate: () => {},
      }
      const tool: any = {
        name: 'brush',
        frameType: TOOL_FRAME_IMAGE,
        frameImageName: 'brush-14',
        frameImageFile: { width: 512, height: 512 },
        color: '#336699',
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
      for (let i = 0; i < 20; i++) {
        drawStrokeSample(ctx, { ...sample, x: 10 + i }, tool, true)
      }
      const scaled = FakeCanvas.instances.filter((c) => c.width === 40 && c.height === 40)
      expect(scaled).toHaveLength(1)
      expect(drawn).toHaveLength(20)
      expect(drawn.every((img) => img === scaled[0])).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
