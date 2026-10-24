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
  createCustomBrushPreviewController,
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

  it('paints only the new preview segment while drawing', () => {
    const ops: string[] = []
    const canvasListeners = new Map<string, (event: Event) => void>()
    const docListeners = new Map<string, (event: Event) => void>()
    const canvas = {
      width: 240,
      height: 240,
      getBoundingClientRect: () => ({
        width: 240,
        height: 240,
        left: 0,
        top: 0,
        right: 240,
        bottom: 240,
      }),
      addEventListener: (type: string, fn: (event: Event) => void) => {
        canvasListeners.set(type, fn)
      },
      removeEventListener: (type: string) => {
        canvasListeners.delete(type)
      },
      getContext: () => ctx,
    }
    const ctx: any = new Proxy(
      {
        canvas,
        clearRect: () => ops.push('clearRect'),
        fill: () => ops.push('fill'),
        beginPath: () => ops.push('beginPath'),
        arc: () => ops.push('arc'),
        ellipse: () => ops.push('ellipse'),
      },
      {
        get(target, prop) {
          if (prop in target) return (target as any)[prop]
          const fn = () => {}
          ;(target as any)[prop] = fn
          return fn
        },
        set(target, prop, value) {
          ;(target as any)[prop] = value
          return true
        },
      }
    )
    const prevDocument = globalThis.document
    const prevRaf = globalThis.requestAnimationFrame
    const prevCancelRaf = globalThis.cancelAnimationFrame
    const prevOffscreen = (globalThis as any).OffscreenCanvas
    let nextRafId = 1
    let pendingRaf: { id: number; cb: FrameRequestCallback } | null = null

    ;(globalThis as any).document = {
      addEventListener: (type: string, fn: (event: Event) => void) => {
        docListeners.set(type, fn)
      },
      removeEventListener: (type: string) => {
        docListeners.delete(type)
      },
    }
    ;(globalThis as any).OffscreenCanvas = class {
      width: number
      height: number
      constructor(w: number, h: number) {
        this.width = w
        this.height = h
      }
      getContext() {
        const label = this.width >= 300 ? 'shape' : 'surface'
        const target: Record<string, unknown> = {
          fillStyle: '',
          globalCompositeOperation: 'source-over',
          clearRect: () => ops.push(`${label}:clear`),
          fill: () => ops.push(`${label}:fill`),
          fillRect() {},
          drawImage() {},
        }
        return new Proxy(target, {
          get(obj, prop) {
            if (prop in obj) return obj[prop as string]
            const fn = () => {}
            obj[prop as string] = fn
            return fn
          },
          set(obj, prop, value) {
            obj[prop as string] = value
            return true
          },
        })
      }
    }
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = nextRafId++
      pendingRaf = { id, cb }
      return id
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number) => {
      if (pendingRaf?.id === id) pendingRaf = null
    }) as typeof cancelAnimationFrame

    const flushRaf = () => {
      const job = pendingRaf
      pendingRaf = null
      job?.cb(0)
    }
    const pointer = (x: number, y: number, timeStamp: number) => ({
      button: 0,
      clientX: x,
      clientY: y,
      timeStamp,
      pointerType: 'pen',
      pressure: 0.4,
      preventDefault() {},
      stopPropagation() {},
    })

    const tool = {
      ...getOneToolVersionCompleteProps('marker', false),
      frameType: TOOL_FRAME_CIRCLE,
      stabilization: 0,
      size: 24,
      alpha: 1,
      minAlpha: 0,
      maxAlpha: 1,
      color: '#112233',
      randomColor: false,
    }
    const controller = createCustomBrushPreviewController(canvas as any, 240, () => tool as any)

    try {
      const visibleClears = () => ops.filter((op) => op === 'clearRect').length
      const surfaceClears = () => ops.filter((op) => op === 'surface:clear').length
      const surfaceFills = () => ops.filter((op) => op === 'surface:fill').length

      controller.renderNow()
      expect(visibleClears()).toBe(1)

      canvasListeners.get(Params.eventStart)?.(pointer(20, 20, 10) as any)
      const clearsAfterStart = surfaceClears()
      const fillsAfterStart = surfaceFills()
      const visibleAfterStart = visibleClears()

      for (let i = 1; i <= 12; i++) {
        docListeners.get(Params.eventMove)?.(pointer(20 + i * 12, 20 + i * 8, 10 + i * 8) as any)
      }
      flushRaf()
      docListeners.get(Params.eventEnd)?.(pointer(180, 140, 200) as any)

      expect(visibleClears() - visibleAfterStart).toBe(2)
      expect(surfaceClears() - clearsAfterStart).toBeLessThan(12)
      expect(surfaceFills()).toBeGreaterThan(fillsAfterStart)

      const clearsBeforeParam = surfaceClears()
      const visibleBeforeParam = visibleClears()
      tool.size = 48
      controller.requestLatestRender()
      flushRaf()
      expect(visibleClears()).toBe(visibleBeforeParam + 1)
      expect(surfaceClears() - clearsBeforeParam).toBeGreaterThan(0)
      expect(surfaceClears() - clearsBeforeParam).toBeLessThan(14)

      tool.stabilization = 0.8
      canvasListeners.get(Params.eventStart)?.(pointer(24, 24, 300) as any)
      const clearsAfterStabilizedStart = surfaceClears()
      for (let i = 1; i <= 12; i++) {
        docListeners.get(Params.eventMove)?.(pointer(24 + i * 10, 24 + i * 6, 300 + i * 8) as any)
      }
      flushRaf()
      docListeners.get(Params.eventEnd)?.(pointer(160, 120, 500) as any)
      expect(surfaceClears() - clearsAfterStabilizedStart).toBeLessThan(12)
    } finally {
      controller.destroy()
      globalThis.document = prevDocument
      globalThis.requestAnimationFrame = prevRaf
      globalThis.cancelAnimationFrame = prevCancelRaf
      ;(globalThis as any).OffscreenCanvas = prevOffscreen
    }
  })
})
