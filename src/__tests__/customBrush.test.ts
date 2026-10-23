import { describe, it, expect, beforeEach } from 'vitest'
import Params from 'main/Params'
import {
  addCustomBrush,
  applyPreviewMotionStabilization,
  clampAndRoundSchemaValue,
  CUSTOM_BRUSH_FRAME_OPTIONS,
  CUSTOM_BRUSH_PARAM_SCHEMA,
  CustomBrushPersisted,
  formatSchemaNumber,
  getCustomBrushCount,
  getCustomBrushes,
  getDefaultCustomBrushDraft,
  getSelectedCustomBrushId,
  getSelectedCustomBrushIndex,
  isCustomBrushSupported,
  loadCustomBrushes,
  removeCustomBrush,
  resetCustomBrushStoreForTests,
  sanitizeCustomBrushDraft,
  setCustomBrushCustomProps,
  setCustomBrushStorageAdapter,
  setHydratedCustomBrushImage,
  updateCustomBrush,
} from 'pages/Editor/components/CustomBrush'
import { getOneToolVersionCompleteProps } from 'pages/Editor/components/Tools/toolsPersistence'
import { initToolsConfig } from 'pages/Editor/components/Tools/toolsState'
import {
  TOOL_FRAME_CIRCLE,
  TOOL_FRAME_IMAGE,
  TOOL_FRAME_PARTICLES_CIRCLE,
  TOOL_FRAME_SPRAY_CIRCLE,
  TOOL_FRAME_SQUARE,
  TOOL_FRAME_TRIANGLE,
} from 'pages/Editor/constants'
import { renderBrushPreview, getToolPreviewTouchEvents } from 'pages/Editor/brushPreviewPipeline'
import { normalizeToolDrawParams } from 'utils/canvasUtils'

describe('CustomBrush store, param schema, and tool resolution', () => {
  let memoryDb: {
    customBrushes: CustomBrushPersisted[]
    selectedCustomBrushId: string | false
  }

  beforeEach(() => {
    Params.isPhone = false
    memoryDb = {
      customBrushes: [],
      selectedCustomBrushId: false,
    }
    setCustomBrushStorageAdapter({
      load: async () => ({
        customBrushes: JSON.parse(JSON.stringify(memoryDb.customBrushes)),
        selectedCustomBrushId: memoryDb.selectedCustomBrushId,
      }),
      save: async (payload) => {
        if (payload.customBrushes !== undefined) {
          memoryDb.customBrushes = JSON.parse(JSON.stringify(payload.customBrushes))
        }
        if (payload.selectedCustomBrushId !== undefined) {
          memoryDb.selectedCustomBrushId = payload.selectedCustomBrushId
        }
      },
    })
    resetCustomBrushStoreForTests()
    initToolsConfig()
  })

  it('excludes customBrush support on phone (iPhone) and enables on tablet/desktop', () => {
    Params.isPhone = false
    expect(isCustomBrushSupported()).toBe(true)

    Params.isPhone = true
    expect(isCustomBrushSupported()).toBe(false)
  })

  it('validates all schema slider bounds against normalizeToolDrawParams and decimal rules', () => {
    const draft = getDefaultCustomBrushDraft()
    expect(CUSTOM_BRUSH_PARAM_SCHEMA.length).toBeGreaterThanOrEqual(45)

    // Verify all commit db6f0a4 params are present in the schema
    const keys = new Set(CUSTOM_BRUSH_PARAM_SCHEMA.map((e) => e.key))
    const requiredNewKeys = [
      'speedCurve',
      'jitterAspectRatio',
      'startTaperFactor',
      'endTaperFactor',
      'endTaperSizeAmount',
      'endTaperAlphaCurve',
      'predictedEventsBlend',
      'stampSpacingMode',
      'stampSpacingFixedPx',
      'stampBlur',
      'stampScaleX',
      'stampScaleY',
      'flow',
      'buildup',
      'particleDensity',
      'sprayDensity',
      'sprayRadiusFactor',
      'colorJitterHue',
      'colorJitterSat',
      'colorJitterLight',
      'pathRotationWeight',
      'rotationSmoothing',
      'stampRotationOffset',
      'minAltitudeFactorToHandleRotation',
      'stampCompositeOperation',
    ]
    for (const reqKey of requiredNewKeys) {
      expect(keys.has(reqKey as any)).toBe(true)
    }

    for (const entry of CUSTOM_BRUSH_PARAM_SCHEMA) {
      if (entry.kind !== 'slider') continue
      expect(typeof entry.min).toBe('number')
      expect(typeof entry.max).toBe('number')
      expect(entry.max!).toBeGreaterThan(entry.min!)
      expect([0, 1, 2, 3]).toContain(entry.decimals)

      const minVal = clampAndRoundSchemaValue(entry, entry.min! - 100)
      const maxVal = clampAndRoundSchemaValue(entry, entry.max! + 100)
      expect(minVal).toBe(entry.min)
      expect(maxVal).toBe(entry.max)

      // Check decimal precision enforcement
      const midRaw = entry.min! + (entry.max! - entry.min!) * 0.3333333
      const roundedMid = clampAndRoundSchemaValue(entry, midRaw)
      const str = formatSchemaNumber(entry, roundedMid)
      const decPart = str.split('.')[1] ?? ''
      expect(decPart.length).toBeLessThanOrEqual(entry.decimals ?? 3)

      // Ensure min and max survive normalizeToolDrawParams without being clamped away
      const normMin = normalizeToolDrawParams({
        ...(draft as any),
        frameType: TOOL_FRAME_CIRCLE,
        [entry.key]: minVal,
      }) as Record<string, unknown>
      if (entry.key in normMin && typeof normMin[entry.key] === 'number') {
        expect(normMin[entry.key]).toBeCloseTo(minVal, entry.decimals!)
      }
    }
  })

  it('exposes circle, square, triangle, spray, particles, image, and customDraw frame options', () => {
    const frameIds = CUSTOM_BRUSH_FRAME_OPTIONS.map((f) => f.id)
    expect(frameIds).toEqual([
      'circle',
      'square',
      'triangle',
      'sprayCircle',
      'particlesCircle',
      'particlesRect',
      'image',
      'customDraw',
    ])
  })

  it('performs CRUD operations, persists to AppData, and resolves tool props via getOneToolVersionCompleteProps', async () => {
    await loadCustomBrushes()
    expect(getCustomBrushCount()).toBe(0)

    const { brush: b1, index: i1 } = await addCustomBrush({
      frameType: TOOL_FRAME_SQUARE,
      size: 42,
      minSize: 5,
      maxSize: 120,
      alpha: 0.65,
      flow: 0.8,
      buildup: 0.3,
      colorJitterHue: 25,
    })
    expect(i1).toBe(0)
    expect(getSelectedCustomBrushId()).toBe(b1.id)

    const { brush: b2, index: i2 } = await addCustomBrush({
      frameType: TOOL_FRAME_SPRAY_CIRCLE,
      size: 60,
      sprayDensity: 2.5,
      sprayRadiusFactor: 1.4,
    })
    expect(i2).toBe(1)
    expect(getCustomBrushCount()).toBe(2)

    // Reload from simulated IndexedDB AppData
    resetCustomBrushStoreForTests()
    await loadCustomBrushes()
    expect(getCustomBrushCount()).toBe(2)
    expect(getSelectedCustomBrushId()).toBe(b2.id)
    expect(getSelectedCustomBrushIndex()).toBe(1)

    // Resolve props for custom brush #1 (index 0) and #2 (index 1)
    const resolved0 = getOneToolVersionCompleteProps('customBrush', 0, { color: '#112233' })
    expect(resolved0.name).toBe('customBrush')
    expect(resolved0.versionName).toBe('1')
    expect(resolved0.frameType).toBe(TOOL_FRAME_SQUARE)
    expect(resolved0.size).toBe(42)
    expect(resolved0.flow).toBe(0.8)
    expect(resolved0.buildup).toBe(0.3)
    expect(resolved0.colorJitterHue).toBe(25)

    const resolved1 = getOneToolVersionCompleteProps('customBrush', 1, { color: '#445566' })
    expect(resolved1.versionName).toBe('2')
    expect(resolved1.frameType).toBe(TOOL_FRAME_SPRAY_CIRCLE)
    expect(resolved1.sprayDensity).toBe(2.5)
    expect(resolved1.sprayRadiusFactor).toBe(1.4)

    // Toolbar customProps override on brush #1
    await setCustomBrushCustomProps(0, { size: 77, alpha: 0.44 })
    const resolved0Override = getOneToolVersionCompleteProps('customBrush', 0)
    expect(resolved0Override.size).toBe(77)
    expect(resolved0Override.alpha).toBe(0.44)

    // Update brush #1 in modal
    await updateCustomBrush(b1.id, {
      ...b1.props,
      frameType: TOOL_FRAME_TRIANGLE,
      size: 33,
    })
    const resolved0Updated = getOneToolVersionCompleteProps('customBrush', 0)
    expect(resolved0Updated.frameType).toBe(TOOL_FRAME_TRIANGLE)
    expect(resolved0Updated.size).toBe(33)

    // Delete brush #1 -> brush #2 becomes index 0
    const delRes = await removeCustomBrush(b1.id)
    expect(delRes.remaining.length).toBe(1)
    expect(delRes.nextIndex).toBe(0)
    expect(getCustomBrushes()[0].id).toBe(b2.id)
  })

  it('resolves image frames when hydrated and falls back to circle when image is missing', async () => {
    const { brush } = await addCustomBrush({
      frameType: TOOL_FRAME_IMAGE,
      frameImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      size: 30,
    })

    // Without hydrated image in test env, falls back safely to circle
    const fallbackResolved = getOneToolVersionCompleteProps('customBrush', 0)
    expect(fallbackResolved.frameType).toBe(TOOL_FRAME_CIRCLE)
    expect(fallbackResolved.frameImageFile).toBeNull()

    // With hydrated image canvas/element in cache, resolves TOOL_FRAME_IMAGE
    const fakeCanvas = { width: 512, height: 512 } as unknown as HTMLCanvasElement
    setHydratedCustomBrushImage(brush.id, fakeCanvas)
    const hydratedResolved = getOneToolVersionCompleteProps('customBrush', 0)
    expect(hydratedResolved.frameType).toBe(TOOL_FRAME_IMAGE)
    expect(hydratedResolved.frameImageFile).toBe(fakeCanvas)
    expect(typeof hydratedResolved.frameImageName).toBe('string')
  })

  it('stabilizes preview samples and renders deterministic preview steps', () => {
    const rawSamples = getToolPreviewTouchEvents(300) as any[]
    const unsmoothed = applyPreviewMotionStabilization(rawSamples, 0)
    expect(unsmoothed).toBe(rawSamples)

    const smoothed = applyPreviewMotionStabilization(rawSamples, 0.8)
    expect(smoothed.length).toBe(rawSamples.length)
    expect(smoothed[0]?.touches?.[0]).toEqual(rawSamples[0]?.touches?.[0])

    const ops: string[] = []
    const mockCtx: any = {
      canvas: { width: 300, height: 300 },
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
      fillStyle: '#000',
      lineCap: 'round',
      lineJoin: 'round',
      lastDrawCoordX: -1,
      lastDrawCoordY: -1,
      toolImageShape: { frameImageName: '', color: '', canvas: {}, context: {} },
      clearRect: () => ops.push('clearRect'),
      beginPath: () => ops.push('beginPath'),
      arc: () => ops.push('arc'),
      ellipse: () => ops.push('ellipse'),
      fill: () => ops.push('fill'),
      fillRect: () => ops.push('fillRect'),
    }
    const toolProps = {
      ...getOneToolVersionCompleteProps('marker', false),
      frameType: TOOL_FRAME_PARTICLES_CIRCLE,
      particleDensity: 1.5,
      color: '#223344',
      randomColor: false,
    }
    const steps = renderBrushPreview(mockCtx, toolProps, smoothed)
    expect(steps.length).toBe(rawSamples.length)
    expect(ops[0]).toBe('clearRect')
    expect(ops.filter((o) => o === 'fillRect').length).toBeGreaterThan(10)
  })

  it('strips forbidden runtime keys in sanitizeCustomBrushDraft', () => {
    const cleaned = sanitizeCustomBrushDraft({
      size: 40,
      frameType: TOOL_FRAME_CIRCLE,
      frameImageBase64: 'data:image/png;base64,abc',
      ...({
        name: 'hacked',
        globalCompositeOperation: 'destination-out',
        hasSizeAndAlpha: false,
      } as any),
    })
    expect((cleaned as any).name).toBeUndefined()
    expect((cleaned as any).globalCompositeOperation).toBeUndefined()
    expect((cleaned as any).hasSizeAndAlpha).toBeUndefined()
    // Cleared because frameType is circle, not image
    expect(cleaned.frameImageBase64).toBeUndefined()
  })
})
