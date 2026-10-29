import { describe, expect, it, vi } from 'vitest'
import { fitAutoTextBoxWidth, layoutTextSpec } from 'pages/Editor/text/textLayout'
import { paintTextSpecOnContext } from 'pages/Editor/text/textRaster'
import {
  applyAffineResizeToTextSpec,
  cloneTextSpec,
  createDefaultTextSpec,
  resolveRestoredTextSpec,
  TEXT_EDIT_PLACEHOLDER,
} from 'pages/Editor/text/textSpec'
import {
  ensureTextFontLoaded,
  isTextFontLoaded,
  resetLoadedFontsForTest,
  setFontImporterOverridesForTest,
} from 'pages/Editor/text/textFonts'

const measureChars = (text: string) => text.length * 10

const mockCtx = () => {
  const fillTexts: string[] = []
  const fillXs: number[] = []
  const ctx = {
    canvas: { width: 800, height: 600 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '',
    textBaseline: 'alphabetic',
    textAlign: 'start',
    lineJoin: 'miter',
    lineCap: 'butt',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    measureText: (text: string) => ({ width: measureChars(text) }),
    fillText: vi.fn((text: string, x: number) => {
      fillTexts.push(text)
      fillXs.push(x)
    }),
    strokeText: vi.fn(),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fillTexts, fillXs }
}

describe('editable raster text', () => {
  it('wraps lines to the box width and centers shorter lines', () => {
    const spec = createDefaultTextSpec({
      text: 'abcdef',
      width: 50,
      fontSize: 20,
      x: 10,
      y: 20,
    })
    spec.align = 'center'
    const layout = layoutTextSpec(spec, null, measureChars)
    expect(layout.lines.map((line) => line.text)).toEqual(['abcde', 'f'])
    expect(layout.lines[0].width).toBe(50)
    expect(layout.lines[1].width).toBe(10)

    const { ctx, fillXs } = mockCtx()
    paintTextSpecOnContext(ctx, spec)
    expect(fillXs[0]).toBe(10)
    expect(fillXs[1]).toBe(10 + (50 - 10) / 2)
  })

  it('replaces the previous glyphs when the spec is painted again', () => {
    const { ctx, fillTexts } = mockCtx()
    const first = createDefaultTextSpec({ text: 'One', width: 200, fontSize: 32 })
    const second = { ...first, text: 'Two' }
    paintTextSpecOnContext(ctx, first, { clearTarget: true })
    paintTextSpecOnContext(ctx, second, { clearTarget: true })
    expect(ctx.clearRect).toHaveBeenCalledTimes(2)
    expect(fillTexts).toEqual(['One', 'Two'])
    expect(ctx.restore).toHaveBeenCalled()
  })

  it('round-trips a spec and restores or clears it from a history step', () => {
    const spec = createDefaultTextSpec({ text: 'Hello', width: 180, fontSize: 40 })
    spec.italic = true
    spec.flipX = true
    const restored = cloneTextSpec(JSON.parse(JSON.stringify(spec)))
    expect(restored).toEqual(spec)
    expect(restored).not.toBe(spec)
    expect(resolveRestoredTextSpec({ textSpec: spec })?.text).toBe('Hello')
    expect(resolveRestoredTextSpec({ textSpec: null })).toBeUndefined()
    expect(resolveRestoredTextSpec({})).toBeUndefined()
  })

  it('grows the box with the text until the canvas edge, then keeps a resized width', () => {
    const spec = createDefaultTextSpec({ text: '', x: 20, y: 10, width: 40, fontSize: 20 })
    fitAutoTextBoxWidth(spec, 400, null, measureChars)
    expect(spec.width).toBe(measureChars(TEXT_EDIT_PLACEHOLDER))
    expect(spec.widthLocked).toBe(false)

    spec.text = 'hello'
    fitAutoTextBoxWidth(spec, 400, null, measureChars)
    expect(spec.width).toBe(measureChars(TEXT_EDIT_PLACEHOLDER))

    spec.text = 'a much longer line of text'
    fitAutoTextBoxWidth(spec, 400, null, measureChars)
    expect(spec.width).toBe(Math.min(380, measureChars(spec.text)))

    spec.x = 300
    fitAutoTextBoxWidth(spec, 400, null, measureChars)
    expect(spec.width).toBe(100)

    spec.widthLocked = true
    spec.width = 80
    spec.text = 'even more text than before'
    spec.fontSize = 80
    fitAutoTextBoxWidth(spec, 400, null, measureChars)
    expect(spec.width).toBe(80)
  })

  it('scales font and width from an affine resize', () => {
    const spec = createDefaultTextSpec({ text: 'Scale', x: 0, y: 0, width: 100, fontSize: 40 })
    const next = applyAffineResizeToTextSpec(
      spec,
      { x: 50, y: 25, w: 100, h: 50 },
      { x: 100, y: 50, w: 200, h: 100, r: 0 }
    )
    expect(next.width).toBe(200)
    expect(next.fontSize).toBe(80)
    expect(spec.fontSize).toBe(40)
  })

  it('does not fetch a catalog font until that family is requested', async () => {
    resetLoadedFontsForTest()
    setFontImporterOverridesForTest(null)
    const fetchSpy = vi.fn()
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    try {
      expect(isTextFontLoaded('Inter')).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
      await ensureTextFontLoaded('Poppins')
      expect(fetchSpy).not.toHaveBeenCalled()

      const importer = vi.fn(async () => 'blob:inter')
      setFontImporterOverridesForTest({ 'Inter-Variable.woff2': importer })
      const loaded = await ensureTextFontLoaded('Inter')
      expect(loaded).toBe(true)
      expect(importer).toHaveBeenCalledTimes(1)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(isTextFontLoaded('Inter')).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
      setFontImporterOverridesForTest(null)
      resetLoadedFontsForTest()
    }
  })
})
