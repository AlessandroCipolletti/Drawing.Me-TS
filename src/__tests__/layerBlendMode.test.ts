/**
 * Manual iPad QA (user):
 * - Multiply on shadow layer; Screen/Add on highlights; Overlay for contrast
 * - Masked layer + blend; merge-down bakes; save/reload; coworking sync; undo/redo
 * - Export PNG matches on-canvas stack
 */
import { describe, expect, it } from 'vitest'
import {
  LAYER_BLEND_MODES,
  blendModeBadgeLetter,
  blendModeToCanvasGco,
  blendModeToCss,
  compositeLayerOntoContext,
  exportStackCompositeOperations,
  mergeStackCompositeOperation,
  nextBlendMode,
  normalizeBlendMode,
} from 'pages/Editor/components/Layers/layerBlendMode'

describe('layerBlendMode', () => {
  it('maps modes to CSS and canvas GCO', () => {
    expect(blendModeToCss('normal')).toBe('normal')
    expect(blendModeToCss('multiply')).toBe('multiply')
    expect(blendModeToCss('add')).toBe('plus-lighter')
    expect(blendModeToCanvasGco('normal')).toBe('source-over')
    expect(blendModeToCanvasGco('multiply')).toBe('multiply')
    expect(blendModeToCanvasGco('add')).toBe('lighter')
  })

  it('normalizes unknown values to normal', () => {
    expect(normalizeBlendMode(undefined)).toBe('normal')
    expect(normalizeBlendMode('screen')).toBe('screen')
    expect(normalizeBlendMode('color-dodge')).toBe('normal')
  })

  it('maps blend badge letters for non-normal modes', () => {
    expect(blendModeBadgeLetter('normal')).toBe(false)
    expect(blendModeBadgeLetter('multiply')).toBe('M')
    expect(blendModeBadgeLetter('screen')).toBe('S')
    expect(blendModeBadgeLetter('overlay')).toBe('O')
    expect(blendModeBadgeLetter('add')).toBe('A')
  })

  it('cycles through all modes in order', () => {
    let mode = normalizeBlendMode('normal')
    for (let i = 0; i < LAYER_BLEND_MODES.length; i++) {
      mode = nextBlendMode(mode)
    }
    expect(mode).toBe('normal')
    expect(nextBlendMode('add')).toBe('normal')
    expect(nextBlendMode('normal')).toBe('multiply')
  })
})

describe('mergeStackCompositeOperation', () => {
  it('uses source-over for the first merged slice and blend for upper slices', () => {
    expect(mergeStackCompositeOperation(true, 'multiply')).toBe('source-over')
    expect(mergeStackCompositeOperation(false, 'multiply')).toBe('multiply')
    expect(mergeStackCompositeOperation(false, 'add')).toBe('lighter')
  })
})

describe('exportStackCompositeOperations', () => {
  it('returns bottom-to-top GCO for active layers only', () => {
    expect(
      exportStackCompositeOperations([
        { active: true, blendMode: 'normal' },
        { active: false, blendMode: 'screen' },
        { active: true, blendMode: 'multiply' },
      ])
    ).toEqual(['source-over', 'multiply'])
  })
})

describe('compositeLayerOntoContext', () => {
  it('sets opacity and GCO then resets state', () => {
    const calls: Array<{ alpha?: number; gco?: string; draw?: boolean }> = []
    const ctx = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      drawImage() {
        calls.push({ alpha: ctx.globalAlpha, gco: ctx.globalCompositeOperation, draw: true })
      },
    } as unknown as CanvasRenderingContext2D

    compositeLayerOntoContext(ctx, {} as CanvasImageSource, 0.5, 'screen')

    expect(calls[0]).toEqual({ alpha: 0.5, gco: 'screen', draw: true })
    expect(ctx.globalAlpha).toBe(1)
    expect(ctx.globalCompositeOperation).toBe('source-over')
  })
})
