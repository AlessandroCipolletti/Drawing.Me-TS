import { describe, it, expect, vi } from 'vitest'
import baselineFixture from './fixtures/toolDefaultsBaseline.json'
import {
  drawStrokeSample,
  normalizeToolDrawParams,
  sanitizeToolCustomProps,
  StrokeSample,
  ExtendedCanvasContext,
} from 'utils/canvasUtils'
import { getOneToolVersionCompleteProps } from 'pages/Editor/components/Tools/toolsPersistence'
import {
  getStepData,
  getStepsDataFromTouchEvents,
  updateLastStepData,
  updateCurrentTouchData,
  initCanvasOffset,
} from 'pages/Editor/editorUtils'
import { addTouchStepDataKeys, removeTouchStepDataKeys } from 'pages/Editor/editorCoworkingBridge'
import { toolDefaultProps } from 'pages/Editor/config'
import {
  applyOneEuroFilter,
  applyResponseCurve,
  getAltitudeFactorFromAngle,
  getStepAlpha,
  getStepAspectRatio,
  getStepRotation,
  getStepSize,
} from 'pages/Editor/editorStepMath'
import {
  handleTouchEventsWithGestures,
  normalizeTouchOrPointerEvent,
} from 'utils/pointerEventsUtils/touchEventsUtils'
import { handleDesktopEventsWithGesture } from 'utils/pointerEventsUtils/desktopEventsUtils'
import { spacing, init as initTheme } from 'main/Theme'
import { TOUCH_TYPE_STYLUS } from 'main/constants'
import {
  TOOL_FRAME_CIRCLE,
  TOOL_FRAME_SQUARE,
  TOOL_FRAME_TRIANGLE,
  TOOL_FRAME_SPRAY_CIRCLE,
  TOOL_FRAME_PARTICLES_CIRCLE,
  TOOL_FRAME_PARTICLES_RECT,
  TOOL_FRAME_IMAGE,
} from 'pages/Editor/constants'
import Params from 'main/Params'

function createMockCanvasContext(): {
  ctx: ExtendedCanvasContext
  ops: Array<{ op: string; args: any[] }>
} {
  const ops: Array<{ op: string; args: any[] }> = []
  const ctx: any = {
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineCap: 'round',
    lineJoin: 'round',
    lineWidth: 1,
    lastDrawCoordX: -1,
    lastDrawCoordY: -1,
    toolImageShape: {
      frameImageName: '',
      color: '',
      canvas: {} as any,
      context: {} as any,
    },
    save: () => ops.push({ op: 'save', args: [] }),
    restore: () => ops.push({ op: 'restore', args: [] }),
    beginPath: () => ops.push({ op: 'beginPath', args: [] }),
    closePath: () => ops.push({ op: 'closePath', args: [] }),
    moveTo: (x: number, y: number) => ops.push({ op: 'moveTo', args: [x, y] }),
    lineTo: (x: number, y: number) => ops.push({ op: 'lineTo', args: [x, y] }),
    arc: (x: number, y: number, r: number) => ops.push({ op: 'arc', args: [x, y, r] }),
    ellipse: (x: number, y: number, rx: number, ry: number, rot: number) =>
      ops.push({ op: 'ellipse', args: [x, y, rx, ry, rot] }),
    fill: () => ops.push({ op: 'fill', args: [] }),
    stroke: () => ops.push({ op: 'stroke', args: [] }),
    translate: (x: number, y: number) => ops.push({ op: 'translate', args: [x, y] }),
    rotate: (angle: number) => ops.push({ op: 'rotate', args: [angle] }),
    fillRect: (x: number, y: number, w: number, h: number) =>
      ops.push({ op: 'fillRect', args: [x, y, w, h] }),
    drawImage: (...args: any[]) => ops.push({ op: 'drawImage', args }),
  }
  return { ctx: ctx as ExtendedCanvasContext, ops }
}

describe('Unified Numeric Stroke Kernel (Local & PeerJS Coworking)', () => {
  it('paints identical canvas operations for local strokes and remote coworking strokes via drawStrokeSample', () => {
    const tool: any = {
      name: 'marker',
      version: 1,
      color: '#ff3366',
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      frameType: TOOL_FRAME_CIRCLE,
      size: 20,
      alpha: 0.8,
      minAlpha: 0.1,
      maxAlpha: 1,
      minPxDistanceBetweenFrames: 1,
      sizeToFramesRatio: 0.2,
      sizeAltitudeFactor: 0,
      sizeForceFactor: 0,
      sizeSpeedFactor: 0,
      alphaForceFactor: 0,
      alphaAltitudeFactor: 0,
      alphaSpeedFactor: 0,
      handleStylusRotation: false,
      handlePathRotation: false,
    }

    const state: any = {
      lastStep: {
        x: -1,
        y: -1,
        midX: -1,
        midY: -1,
        alpha: 0,
        size: 0,
        rotation: 0,
      },
    }

    const touch1 = {
      type: 'start',
      touchType: TOUCH_TYPE_STYLUS,
      x: 100,
      y: 120,
      midX: 100,
      midY: 120,
      force: 0.5,
      altitudeFactor: 0.2,
      speedFactor: 0.1,
      rotation: 0,
      pathRotation: 0,
      stepLength: 0,
      isDown: false,
    }
    const sampleStart = getStepData(tool, touch1, state.lastStep)
    updateLastStepData(state, sampleStart)

    const touch2 = {
      ...touch1,
      type: 'move',
      isDown: true,
      x: 140,
      y: 160,
      midX: 120,
      midY: 140,
      stepLength: 56.5,
    }
    const sampleMove = getStepData(tool, touch2, state.lastStep)
    updateLastStepData(state, sampleMove)

    const touch3 = {
      ...touch2,
      type: 'end',
      isDown: false,
      x: 180,
      y: 200,
      midX: 160,
      midY: 180,
      stepLength: 56.5,
    }
    const sampleEnd = getStepData(tool, touch3, state.lastStep)

    // 1. Paint locally via drawStrokeSample
    const localCanvas = createMockCanvasContext()
    drawStrokeSample(localCanvas.ctx, sampleStart, tool, true)
    drawStrokeSample(localCanvas.ctx, sampleMove, tool, true)
    drawStrokeSample(localCanvas.ctx, sampleEnd, tool, true)

    // 2. Paint remotely (PeerJS coworking path) using the exact same numeric samples & drawStrokeSample
    const remoteCanvas = createMockCanvasContext()
    const steps: StrokeSample[] = JSON.parse(JSON.stringify([sampleStart, sampleMove, sampleEnd]))
    for (const step of steps) {
      drawStrokeSample(remoteCanvas.ctx, step, tool, true)
    }

    expect(localCanvas.ops.length).toBeGreaterThan(5)
    expect(remoteCanvas.ops).toEqual(localCanvas.ops)
  })

  it('paints deterministic particle and spray stamps across local and remote coworker canvases with Retina stamp downsampling', () => {
    for (const frameType of [
      TOOL_FRAME_SPRAY_CIRCLE,
      TOOL_FRAME_PARTICLES_CIRCLE,
      TOOL_FRAME_PARTICLES_RECT,
    ]) {
      const tool: any = {
        name: 'spray',
        color: '#2288ff',
        globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
        frameType,
        size: 120,
        minPxDistanceBetweenFrames: 2,
        sizeToFramesRatio: 0.25,
      }

      const sampleStart: StrokeSample = {
        type: 'start',
        x: 200,
        y: 240,
        midX: 200,
        midY: 240,
        size: 120,
        alpha: 0.65,
        rotation: 0,
        oldSize: 120,
        oldAlpha: 0.65,
        oldRotation: 0,
        oldMidX: 200,
        oldMidY: 240,
        oldX: 200,
        oldY: 240,
        stepLength: 0,
      }

      const localCanvas = createMockCanvasContext()
      const remoteCanvas = createMockCanvasContext()

      drawStrokeSample(localCanvas.ctx, sampleStart, tool, true)
      drawStrokeSample(remoteCanvas.ctx, { ...sampleStart }, tool, true)

      expect(localCanvas.ops.length).toBeGreaterThan(10)
      expect(localCanvas.ops.length).toBeLessThanOrEqual(200)
      expect(remoteCanvas.ops).toEqual(localCanvas.ops)
    }
  })

  it('starts Apple Pencil (stylus) strokes immediately without waiting for the 40ms finger gesture window and processes coalesced samples', () => {
    const started: any[] = []
    const moved: any[] = []
    const ended: any[] = []

    const targetListeners: Record<string, (e: any) => void> = {}
    const docListeners: Record<string, (e: any) => void> = {}

    const mockTarget: any = {
      addEventListener: (type: string, fn: (e: any) => void) => {
        targetListeners[type] = fn
      },
    }

    const origDoc = (globalThis as any).document
    ;(globalThis as any).document = {
      addEventListener: (type: string, fn: any) => {
        docListeners[type] = fn
      },
      removeEventListener: (type: string) => {
        delete docListeners[type]
      },
    }

    try {
      handleTouchEventsWithGestures(mockTarget, {
        onSingleTouchStart: (_e, t) => started.push(t),
        onSingleTouchMove: (_e, t) => moved.push(t),
        onSingleTouchEnd: (t) => ended.push(t),
      })

      const stylusTouch = {
        identifier: 1,
        touchType: TOUCH_TYPE_STYLUS,
        target: mockTarget,
        clientX: 250,
        clientY: 300,
        force: 0.4,
      }

      targetListeners[Params.eventStart]({
        touches: [stylusTouch],
        changedTouches: [stylusTouch],
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      })

      // Synchronous start on the very same tick (no 40ms delay, no requestAnimationFrame delayFn)
      expect(started).toHaveLength(1)
      expect(started[0].clientX).toBe(250)

      const coalesced1 = { ...stylusTouch, clientX: 260, clientY: 310 }
      const coalesced2 = { ...stylusTouch, clientX: 270, clientY: 320 }
      docListeners[Params.eventMove]({
        touches: [coalesced2],
        changedTouches: [coalesced2],
        getCoalescedEvents: () => [coalesced1, coalesced2],
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      })

      expect(moved).toHaveLength(2)
      expect(moved[0].clientX).toBe(260)
      expect(moved[1].clientX).toBe(270)

      docListeners[Params.eventEnd]({
        touches: [],
        changedTouches: [coalesced2],
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      })

      expect(ended).toHaveLength(1)
    } finally {
      ;(globalThis as any).document = origDoc
    }
  })

  it('handles W3C PointerEvents with pointerId tracking for 2-finger pinch/rotate and 2/3/4-finger taps', () => {
    const gestures: Array<{ phase: string; x: number; y: number; s: number; r: number }> = []
    let twoFingerTaps = 0
    let threeFingerTaps = 0
    let fourFingerTaps = 0

    const targetListeners: Record<string, (e: any) => void> = {}
    const docListeners: Record<string, (e: any) => void> = {}

    const mockTarget: any = {
      style: {},
      addEventListener: (type: string, fn: (e: any) => void) => {
        targetListeners[type] = fn
      },
    }

    const origDoc = (globalThis as any).document
    ;(globalThis as any).document = {
      addEventListener: (type: string, fn: any) => {
        docListeners[type] = fn
      },
      removeEventListener: (type: string) => {
        delete docListeners[type]
      },
    }

    try {
      handleTouchEventsWithGestures(mockTarget, {
        onGestureStart: (x, y, s, r) => gestures.push({ phase: 'start', x, y, s, r }),
        onGestureChange: (x, y, s, r) => gestures.push({ phase: 'change', x, y, s, r }),
        onGestureEnd: (x, y, s, r) => gestures.push({ phase: 'end', x, y, s, r }),
        onTwoFingersSingleTap: () => twoFingerTaps++,
        onThreeFingersSingleTap: () => threeFingerTaps++,
        onFourFingersSingleTap: () => fourFingerTaps++,
      })

      // 1. Two-finger tap -> Undo
      targetListeners[Params.eventStart]({
        pointerId: 1,
        pointerType: 'touch',
        target: mockTarget,
        clientX: 100,
        clientY: 100,
      })
      targetListeners[Params.eventStart]({
        pointerId: 2,
        pointerType: 'touch',
        target: mockTarget,
        clientX: 200,
        clientY: 100,
      })
      docListeners[Params.eventEnd]({
        pointerId: 1,
        pointerType: 'touch',
        clientX: 100,
        clientY: 100,
      })
      docListeners[Params.eventEnd]({
        pointerId: 2,
        pointerType: 'touch',
        clientX: 200,
        clientY: 100,
      })
      expect(twoFingerTaps).toBe(1)

      // 2. Three-finger tap -> Redo
      targetListeners[Params.eventStart]({
        pointerId: 1,
        pointerType: 'touch',
        target: mockTarget,
        clientX: 100,
        clientY: 100,
      })
      targetListeners[Params.eventStart]({
        pointerId: 2,
        pointerType: 'touch',
        target: mockTarget,
        clientX: 150,
        clientY: 100,
      })
      targetListeners[Params.eventStart]({
        pointerId: 3,
        pointerType: 'touch',
        target: mockTarget,
        clientX: 200,
        clientY: 100,
      })
      docListeners[Params.eventEnd]({
        pointerId: 1,
        pointerType: 'touch',
        clientX: 100,
        clientY: 100,
      })
      docListeners[Params.eventEnd]({
        pointerId: 2,
        pointerType: 'touch',
        clientX: 150,
        clientY: 100,
      })
      docListeners[Params.eventEnd]({
        pointerId: 3,
        pointerType: 'touch',
        clientX: 200,
        clientY: 100,
      })
      expect(threeFingerTaps).toBe(1)

      // 3. Four-finger tap -> Fullscreen
      targetListeners[Params.eventStart]({
        pointerId: 1,
        pointerType: 'touch',
        target: mockTarget,
        clientX: 100,
        clientY: 100,
      })
      targetListeners[Params.eventStart]({
        pointerId: 2,
        pointerType: 'touch',
        target: mockTarget,
        clientX: 130,
        clientY: 100,
      })
      targetListeners[Params.eventStart]({
        pointerId: 3,
        pointerType: 'touch',
        target: mockTarget,
        clientX: 160,
        clientY: 100,
      })
      targetListeners[Params.eventStart]({
        pointerId: 4,
        pointerType: 'touch',
        target: mockTarget,
        clientX: 190,
        clientY: 100,
      })
      docListeners[Params.eventEnd]({
        pointerId: 1,
        pointerType: 'touch',
        clientX: 100,
        clientY: 100,
      })
      docListeners[Params.eventEnd]({
        pointerId: 2,
        pointerType: 'touch',
        clientX: 130,
        clientY: 100,
      })
      docListeners[Params.eventEnd]({
        pointerId: 3,
        pointerType: 'touch',
        clientX: 160,
        clientY: 100,
      })
      docListeners[Params.eventEnd]({
        pointerId: 4,
        pointerType: 'touch',
        clientX: 190,
        clientY: 100,
      })
      expect(fourFingerTaps).toBe(1)

      // 4. Two-finger pinch zoom (distance doubles from 100px to 200px -> scale = 2)
      targetListeners[Params.eventStart]({
        pointerId: 10,
        pointerType: 'touch',
        target: mockTarget,
        clientX: 100,
        clientY: 100,
      })
      targetListeners[Params.eventStart]({
        pointerId: 11,
        pointerType: 'touch',
        target: mockTarget,
        clientX: 200,
        clientY: 100,
      })
      for (let i = 1; i <= 7; i++) {
        docListeners[Params.eventMove]({
          pointerId: 10,
          pointerType: 'touch',
          clientX: 100,
          clientY: 100,
        })
      }
      docListeners[Params.eventMove]({
        pointerId: 11,
        pointerType: 'touch',
        clientX: 300,
        clientY: 100,
      })
      docListeners[Params.eventEnd]({
        pointerId: 10,
        pointerType: 'touch',
        clientX: 100,
        clientY: 100,
      })
      docListeners[Params.eventEnd]({
        pointerId: 11,
        pointerType: 'touch',
        clientX: 300,
        clientY: 100,
      })

      expect(gestures.some((g) => g.phase === 'start')).toBe(true)
      expect(gestures.some((g) => g.phase === 'change' && g.s === 2)).toBe(true)
      expect(gestures[gestures.length - 1].phase).toBe('end')
    } finally {
      ;(globalThis as any).document = origDoc
    }
  })

  it('preserves Apple Pencil touchType for stylus azimuth rotation and rejects accidental palm touches during active pen strokes', () => {
    const tool: any = {
      name: 'pencil',
      version: 1,
      color: '#112233',
      globalCompositeOperation: 'source-over',
      frameType: TOOL_FRAME_CIRCLE,
      size: 20,
      alpha: 0.8,
      minAlpha: 0.1,
      maxAlpha: 1,
      minPxDistanceBetweenFrames: 1,
      sizeToFramesRatio: 0.2,
      sizeAltitudeFactor: 0,
      sizeForceFactor: 0,
      sizeSpeedFactor: 0,
      alphaForceFactor: 0,
      alphaAltitudeFactor: 0,
      alphaSpeedFactor: 0,
      handleStylusRotation: true,
      handlePathRotation: true,
      defaultRotation: 0,
    }

    const editorState: any = {
      canvas: {
        offset: { left: 0, top: 0 },
        initialScale: 1,
        scale: 1,
        rotation: 0,
        originCoordX: 0,
        originCoordY: 0,
      },
      currentTouch: {
        type: '',
        touchType: '',
        x: 0,
        y: 0,
        midX: 0,
        midY: 0,
        eventX: 0,
        eventY: 0,
        startDragX: 0,
        startDragY: 0,
        dragX: 0,
        dragY: 0,
        force: 0.5,
        isNearRuler: false,
        isDown: false,
        altitudeAngle: 1,
        altitudeFactor: 0.3,
        azimuthAngle: Math.PI / 4, // 45 deg
        rotation: 0,
        pathRotation: 0,
        stepLength: 0,
        speedFactor: 0,
        canHandleStylusRotation: true,
      },
      lastStep: {
        x: 10,
        y: 10,
        midX: 10,
        midY: 10,
        alpha: 0.8,
        size: 20,
        rotation: 0,
      },
      currentToolProps: tool,
    }

    updateCurrentTouchData(
      editorState,
      {
        touchType: TOUCH_TYPE_STYLUS,
        pageX: 50,
        pageY: 50,
        force: 0.6,
        altitudeAngle: 1.0,
        azimuthAngle: Math.PI / 4,
      },
      Params.eventMove
    )
    expect(editorState.currentTouch.touchType).toBe(TOUCH_TYPE_STYLUS)
    const step = getStepData(tool, editorState.currentTouch, editorState.lastStep)
    // azimuthAngle (pi/4) + pathRotation from (10,10)->(50,50) (pi/4) = pi/2 (~1.5708 rad)
    expect(step.rotation).toBeCloseTo(Math.PI / 2, 3)

    // Verify palm rejection during an active Apple Pencil stroke
    const targetListeners: Record<string, (e: any) => void> = {}
    const docListeners: Record<string, (e: any) => void> = {}
    const mockTarget: any = {
      addEventListener: vi.fn((type: string, cb: any) => {
        targetListeners[type] = cb
      }),
    }
    const origDoc = globalThis.document
    ;(globalThis as any).document = {
      addEventListener: vi.fn((type: string, cb: any) => {
        docListeners[type] = cb
      }),
      removeEventListener: vi.fn(),
    }

    try {
      const events: string[] = []
      handleTouchEventsWithGestures(mockTarget, {
        onSingleTouchStart: () => events.push('start'),
        onSingleTouchMove: (_e: any, sample: any) => events.push(`move:${sample.clientX}`),
        onSingleTouchEnd: () => events.push('end'),
      })

      // Pen down
      targetListeners[Params.eventStart]({
        pointerId: 1,
        pointerType: 'pen',
        target: mockTarget,
        clientX: 10,
        clientY: 10,
      })
      // Accidental palm touch down & up while pen is drawing
      targetListeners[Params.eventStart]({
        pointerId: 2,
        pointerType: 'touch',
        target: mockTarget,
        clientX: 300,
        clientY: 300,
      })
      docListeners[Params.eventMove]({
        pointerId: 1,
        pointerType: 'pen',
        clientX: 25,
        clientY: 25,
      })
      docListeners[Params.eventEnd]({
        pointerId: 2,
        pointerType: 'touch',
        clientX: 300,
        clientY: 300,
      })
      docListeners[Params.eventMove]({
        pointerId: 1,
        pointerType: 'pen',
        clientX: 40,
        clientY: 40,
      })
      docListeners[Params.eventEnd]({
        pointerId: 1,
        pointerType: 'pen',
        clientX: 40,
        clientY: 40,
      })

      expect(events).toEqual(['start', 'move:25', 'move:40', 'end'])
    } finally {
      ;(globalThis as any).document = origDoc
    }
  })

  it('starts Desktop mouse strokes at 0ms latency, applies Desktop wheel pan/zoom on the first tick, and offsets Phone landscape canvas cleanly', () => {
    const targetListeners: Record<string, (e: any) => void> = {}
    const docListeners: Record<string, (e: any) => void> = {}
    const mockTarget: any = {
      addEventListener: vi.fn((type: string, cb: any) => {
        targetListeners[type] = cb
      }),
    }
    const origDoc = globalThis.document
    const origGetComputedStyle = globalThis.getComputedStyle
    ;(globalThis as any).document = {
      documentElement: {},
      addEventListener: vi.fn((type: string, cb: any) => {
        docListeners[type] = cb
      }),
      removeEventListener: vi.fn(),
    }
    ;(globalThis as any).getComputedStyle = () => ({
      getPropertyValue: () => '0',
    })

    try {
      // 1. Desktop mouse starts immediately without waiting 40ms
      const mouseEvents: string[] = []
      handleTouchEventsWithGestures(mockTarget, {
        onSingleTouchStart: (_e: any, sample: any) => mouseEvents.push(`start:${sample.clientX}`),
        onSingleTouchMove: (_e: any, sample: any) => mouseEvents.push(`move:${sample.clientX}`),
        onSingleTouchEnd: () => mouseEvents.push('end'),
      })

      targetListeners[Params.eventStart]({
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        target: mockTarget,
        clientX: 120,
        clientY: 80,
      })
      // Synchronous check: start must already have fired without any async delay
      expect(mouseEvents).toEqual(['start:120'])

      docListeners[Params.eventMove]({
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 140,
        clientY: 90,
      })
      docListeners[Params.eventEnd]({
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 140,
        clientY: 90,
      })
      expect(mouseEvents).toEqual(['start:120', 'move:140', 'end'])

      // 2. Desktop wheel zooms without requiring Ctrl/Meta, and ignores wheel while pointer is down
      const wheelGestures: Array<{ phase: string; x: number; y: number; s: number }> = []
      let wheelBlocked = false
      handleDesktopEventsWithGesture(mockTarget, {
        onGestureStart: (x, y, s) => wheelGestures.push({ phase: 'start', x, y, s }),
        onGestureChange: (x, y, s) => wheelGestures.push({ phase: 'change', x, y, s }),
        isWheelBlocked: () => wheelBlocked,
      })

      targetListeners[Params.eventScroll]({
        clientX: 500,
        clientY: 400,
        deltaX: 0,
        deltaY: -40,
        ctrlKey: false,
        metaKey: false,
      })
      expect(wheelGestures).toEqual([
        { phase: 'start', x: 500, y: 400, s: 1 },
        { phase: 'change', x: 500, y: 400, s: 1.2 },
      ])

      wheelBlocked = true
      targetListeners[Params.eventScroll]({
        clientX: 500,
        clientY: 400,
        deltaX: 0,
        deltaY: -40,
        ctrlKey: false,
        metaKey: false,
      })
      expect(wheelGestures).toHaveLength(2)

      // 3. Phone Portrait vs Landscape canvas offsets
      const prevIsPhone = Params.isPhone
      const prevWidth = Params.width
      const prevHeight = Params.height
      const prevViewportScale = Params.viewportScale
      try {
        Params.isPhone = true
        Params.viewportScale = 1
        initTheme()

        // Portrait
        Params.width = 390
        Params.height = 844
        const portraitState: any = {}
        initCanvasOffset(portraitState)
        expect(portraitState.canvas.offset.left).toBe(spacing.EDITOR_PAGE_MARGIN)

        // Landscape
        Params.width = 844
        Params.height = 390
        const landscapeState: any = {}
        initCanvasOffset(landscapeState)
        expect(landscapeState.canvas.offset.left).toBe(
          spacing.EDITOR_PAGE_MARGIN + spacing.PHONE_LANDSCAPE_PADDING
        )
      } finally {
        Params.isPhone = prevIsPhone
        Params.width = prevWidth
        Params.height = prevHeight
        Params.viewportScale = prevViewportScale
      }
    } finally {
      ;(globalThis as any).document = origDoc
      ;(globalThis as any).getComputedStyle = origGetComputedStyle
    }
  })

  it('computes pure step math (size, alpha, altitude factor, rotation wraparound) deterministically', () => {
    expect(getAltitudeFactorFromAngle(Math.PI / 2, 0.7)).toBe(0)
    expect(getAltitudeFactorFromAngle(0, 1)).toBe(1)

    const tool = {
      size: 20,
      sizeForceFactor: 0.5,
      sizeSpeedFactor: 0.25,
      sizeAltitudeFactor: 0.5,
      alpha: 0.5,
      minAlpha: 0.1,
      maxAlpha: 0.9,
      alphaForceFactor: 0.2,
      alphaSpeedFactor: 0.1,
      alphaAltitudeFactor: -0.1,
      degradeAlphaBySize: false,
      handleStylusRotation: true,
      handlePathRotation: true,
    }
    const touch = {
      type: 'move',
      touchType: TOUCH_TYPE_STYLUS,
      x: 10,
      y: 20,
      midX: 10,
      midY: 20,
      force: 0.5,
      speedFactor: 0.4,
      altitudeFactor: 0.2,
      azimuthAngle: Math.PI / 4,
      pathRotation: Math.PI / 4,
      stepLength: 10,
      canHandleStylusRotation: true,
    }
    const size = getStepSize(tool, touch)
    expect(size).toBe(29)
    expect(getStepAlpha(tool, touch, size)).toBeCloseTo(0.62, 3)
    expect(getStepRotation(tool, touch, { rotation: 0 })).toBeCloseTo(Math.PI / 2, 3)
  })

  it('supports Apple Pencil Pro barrel roll (twist), non-linear response curves, anisotropic aspect ratio, 1€ stabilization, and deterministic jitter across coworking', () => {
    // 1. Apple Pencil Pro twist normalization (degrees -> radians) & vertical barrel roll
    const normPen = normalizeTouchOrPointerEvent({
      pointerId: 1,
      pointerType: 'pen',
      clientX: 100,
      clientY: 100,
      pressure: 0.5,
      altitudeAngle: Math.PI / 2, // held vertically
      azimuthAngle: 0,
      twist: 90, // 90 deg barrel roll
      tangentialPressure: 0.4,
      timeStamp: 1000,
    })
    expect(normPen.twist).toBeCloseTo(Math.PI / 2, 4)
    expect(normPen.hasTwist).toBe(true)
    expect(normPen.tangentialPressure).toBe(0.4)

    // Even when vertical (canHandleStylusRotation = false), handleStylusTwist rotates the nib
    const twistTool = {
      size: 30,
      alpha: 0.5,
      minAlpha: 0.1,
      maxAlpha: 1,
      handleStylusRotation: true,
      handleStylusTwist: true,
      forceCurve: 0.7,
      altitudeCurve: 1.2,
      aspectRatio: 1.2,
      aspectAltitudeFactor: 1.5,
      aspectForceFactor: 0.5,
      endTaperFactor: 0.5,
      jitterPosition: 0.05,
      jitterSize: 0.06,
      jitterAlpha: 0.08,
      jitterRotation: 0.1,
      frameType: TOOL_FRAME_CIRCLE,
      minPxDistanceBetweenFrames: 1,
      sizeToFramesRatio: 0.1,
      preserveStampRemainder: true,
    }
    const verticalTouch = {
      type: 'move',
      touchType: TOUCH_TYPE_STYLUS,
      x: 50,
      y: 60,
      midX: 30,
      midY: 40,
      force: 0.5,
      altitudeFactor: 0.1,
      azimuthAngle: 1.2,
      twist: Math.PI / 2,
      hasTwist: true,
      stepLength: 28,
      canHandleStylusRotation: false,
    }
    expect(getStepRotation(twistTool, verticalTouch, { rotation: 0 })).toBeCloseTo(Math.PI / 2, 3)

    // 2. Response curves & anisotropic aspect ratio
    expect(applyResponseCurve(0.25, 0.5)).toBeCloseTo(0.5, 3)
    expect(applyResponseCurve(0.25, 2.0)).toBeCloseTo(0.0625, 4)
    const aspect = getStepAspectRatio(twistTool, { ...verticalTouch, altitudeFactor: 0.6 })
    expect(aspect).toBeGreaterThan(1.2)

    // 3. 1€ filter stabilization reduces jitter at low velocity and tracks fast strokes
    const [slowFiltered] = applyOneEuroFilter(102, 100, 0, 8, 0.5)
    expect(slowFiltered).toBeGreaterThan(100)
    expect(slowFiltered).toBeLessThan(102)
    const [unfiltered] = applyOneEuroFilter(102, 100, 0, 8, 0)
    expect(unfiltered).toBe(102)

    // 4. Local vs Remote Coworking parity with anisotropic aspectRatio and deterministic jitter
    const startStep = getStepData(
      twistTool,
      { ...verticalTouch, type: 'start', x: 10, y: 10, midX: 10, midY: 10, stepLength: 0 },
      {}
    )
    const moveStep = getStepData(twistTool, { ...verticalTouch, altitudeFactor: 0.7 }, startStep)
    const endStep = getStepData(
      twistTool,
      { ...verticalTouch, type: 'end', x: 70, y: 80, midX: 60, midY: 70, stepLength: 20 },
      moveStep
    )
    expect(endStep.alpha).toBeGreaterThan(twistTool.minAlpha)

    const localCtx = createMockCanvasContext()
    const remoteCtx = createMockCanvasContext()
    drawStrokeSample(localCtx.ctx, startStep, twistTool, true)
    drawStrokeSample(localCtx.ctx, moveStep, twistTool, true)
    drawStrokeSample(localCtx.ctx, endStep, twistTool, true)

    drawStrokeSample(remoteCtx.ctx, { ...startStep }, twistTool, true)
    drawStrokeSample(remoteCtx.ctx, { ...moveStep }, twistTool, true)
    drawStrokeSample(remoteCtx.ctx, { ...endStep }, twistTool, true)

    expect(localCtx.ops.some((o) => o.op === 'ellipse')).toBe(true)
    expect(remoteCtx.ops).toEqual(localCtx.ops)
  })

  it('preserves pre-change baseline for default presets (samples and canvas ops)', () => {
    const presets: Array<{ tool: string; version: number | false }> = [
      { tool: 'marker', version: false },
      { tool: 'pencil', version: 0 },
      { tool: 'pencil', version: 1 },
      { tool: 'pencil', version: 2 },
      { tool: 'highlighter', version: 0 },
      { tool: 'brush', version: 0 },
      { tool: 'brush', version: 5 },
      { tool: 'spray', version: false },
      { tool: 'eraser', version: false },
    ]
    const touches = [
      {
        type: 'start',
        touchType: TOUCH_TYPE_STYLUS,
        x: 40,
        y: 50,
        midX: 40,
        midY: 50,
        force: 0.45,
        altitudeFactor: 0.5,
        speedFactor: 0.2,
        azimuthAngle: 0.4,
        twist: 0.2,
        hasTwist: true,
        pathRotation: 0,
        stepLength: 0,
        canHandleStylusRotation: true,
      },
      {
        type: 'move',
        touchType: TOUCH_TYPE_STYLUS,
        x: 68,
        y: 74,
        midX: 54,
        midY: 62,
        force: 0.65,
        altitudeFactor: 0.55,
        speedFactor: 0.35,
        azimuthAngle: 0.5,
        twist: 0.25,
        hasTwist: true,
        pathRotation: 0.71,
        stepLength: 36.8,
        canHandleStylusRotation: true,
      },
      {
        type: 'end',
        touchType: TOUCH_TYPE_STYLUS,
        x: 92,
        y: 96,
        midX: 80,
        midY: 85,
        force: 0.2,
        altitudeFactor: 0.55,
        speedFactor: 0.18,
        azimuthAngle: 0.52,
        twist: 0.25,
        hasTwist: true,
        pathRotation: 0.74,
        stepLength: 32.5,
        canHandleStylusRotation: true,
      },
    ]

    const results: Record<
      string,
      { samples: StrokeSample[]; opsCount: number; firstOps: any[]; lastOps: any[] }
    > = {}
    for (const { tool, version } of presets) {
      const props = getOneToolVersionCompleteProps(tool, version, { color: '#336699' })
      const state: any = { lastStep: {} }
      const samples: StrokeSample[] = []
      const mock = createMockCanvasContext()
      ;(mock.ctx.toolImageShape as any).canvas = { id: 'stamp-img', width: 32, height: 32 }
      for (const t of touches) {
        const s = getStepData(props, t as any, state.lastStep)
        samples.push(s)
        drawStrokeSample(mock.ctx, s, props, true)
        updateLastStepData(state, s)
      }
      const key = `${tool}:${String(version)}`
      results[key] = {
        samples,
        opsCount: mock.ops.length,
        firstOps: mock.ops.slice(0, 8),
        lastOps: mock.ops.slice(-8),
      }
    }
    expect(results).toEqual(baselineFixture)
  })

  it('normalizes invalid/extreme customProps and preserves defaults as identity', () => {
    const clean = normalizeToolDrawParams({ ...toolDefaultProps })
    expect(clean.stampSpacingMode).toBe('bySize')
    expect(clean.flow).toBe(1)
    expect(clean.buildup).toBe(0)
    expect(clean.stampBlur).toBe(0)
    expect(clean.stampScaleX).toBe(1)
    expect(clean.stampScaleY).toBe(1)
    expect(clean.pathRotationWeight).toBe(1)
    expect(clean.rotationSmoothing).toBe(0)
    expect(clean.endTaperSizeAmount).toBe(0.3)

    const dirty = normalizeToolDrawParams({
      ...toolDefaultProps,
      frameType: TOOL_FRAME_CIRCLE,
      stampSpacingMode: 'invalid-mode' as any,
      stampSpacingFixedPx: -5,
      stampBlur: 999,
      stampScaleX: -2,
      stampScaleY: Number.NaN,
      flow: 5,
      buildup: -1,
      particleDensity: 500,
      sprayDensity: Number.NaN,
      sprayRadiusFactor: 0,
      colorJitterHue: 400,
      colorJitterSat: -0.5,
      colorJitterLight: 3,
      pathRotationWeight: 2,
      rotationSmoothing: -0.5,
      minAltitudeFactorToHandleRotation: Number.NaN,
      startTaperFactor: 2,
      endTaperSizeAmount: Number.NaN,
      endTaperAlphaCurve: -1,
      speedCurve: 0,
      predictedEventsBlend: 9,
      stampCompositeOperation: '' as any,
    })

    expect(dirty.stampSpacingMode).toBe('bySize')
    expect(dirty.stampSpacingFixedPx).toBe(0.1)
    expect(dirty.stampBlur).toBe(32)
    expect(dirty.stampScaleX).toBe(1)
    expect(dirty.stampScaleY).toBe(1)
    expect(dirty.flow).toBe(1)
    expect(dirty.buildup).toBe(0)
    expect(dirty.particleDensity).toBe(10)
    expect(dirty.sprayDensity).toBe(1)
    expect(dirty.sprayRadiusFactor).toBe(1)
    expect(dirty.colorJitterHue).toBe(180)
    expect(dirty.colorJitterSat).toBe(0)
    expect(dirty.colorJitterLight).toBe(1)
    expect(dirty.pathRotationWeight).toBe(1)
    expect(dirty.rotationSmoothing).toBe(0)
    expect(dirty.minAltitudeFactorToHandleRotation).toBe(0.3)
    expect(dirty.startTaperFactor).toBe(1)
    expect(dirty.endTaperSizeAmount).toBe(0.3)
    expect(dirty.endTaperAlphaCurve).toBe(1)
    expect(dirty.speedCurve).toBe(1)
    expect(dirty.predictedEventsBlend).toBe(1)
    expect(dirty.stampCompositeOperation).toBeUndefined()

    const bogusGco = normalizeToolDrawParams({
      ...toolDefaultProps,
      frameType: TOOL_FRAME_CIRCLE,
      stampCompositeOperation: 'not-a-valid-gco' as any,
    })
    expect(bogusGco.stampCompositeOperation).toBeUndefined()

    const sanitized = sanitizeToolCustomProps(
      JSON.parse('{"__proto__":{"polluted":1},"size":30,"badNum":null}')
    )
    expect((sanitized as any).polluted).toBeUndefined()
    expect(sanitized.size).toBe(30)

    // Corrupted/NaN stepLength or flow=0 safely no-ops without infinite loop or canvas ops
    const safeMock = createMockCanvasContext()
    const badMove: StrokeSample = {
      type: 'move',
      x: 10,
      y: 10,
      midX: 10,
      midY: 10,
      size: 20,
      alpha: 0.5,
      rotation: 0,
      oldSize: 20,
      oldAlpha: 0.5,
      oldRotation: 0,
      oldMidX: 0,
      oldMidY: 0,
      oldX: 0,
      oldY: 0,
      stepLength: Number.NaN,
    }
    expect(drawStrokeSample(safeMock.ctx, badMove, clean, true)).toBe(false)
    expect(safeMock.ops).toHaveLength(0)
  })

  it('evaluates extended step math (speedCurve, pathRotationWeight, rotationSmoothing, start/end taper, ruler freeze, per-tool minAltitude)', () => {
    const baseTouch = {
      type: 'move' as const,
      touchType: TOUCH_TYPE_STYLUS,
      x: 50,
      y: 50,
      midX: 30,
      midY: 30,
      force: 0.5,
      speedFactor: 0.25,
      altitudeFactor: 0.4,
      azimuthAngle: 0.4,
      pathRotation: 1.0,
      stepLength: 25,
      canHandleStylusRotation: true,
    }
    const baseTool = {
      ...toolDefaultProps,
      size: 40,
      sizeSpeedFactor: 0.5,
      alpha: 0.4,
      minAlpha: 0.05,
      maxAlpha: 1,
      alphaSpeedFactor: 0.4,
      handleStylusRotation: false,
      handlePathRotation: true,
    }

    // speedCurve=0.5 boosts speedFactor=0.25 -> 0.5
    const linearSize = getStepSize({ ...baseTool, speedCurve: 1 }, baseTouch)
    const curvedSize = getStepSize({ ...baseTool, speedCurve: 0.5 }, baseTouch)
    expect(curvedSize).toBeGreaterThan(linearSize)

    const linearAlpha = getStepAlpha({ ...baseTool, speedCurve: 1 }, baseTouch, linearSize)
    const curvedAlpha = getStepAlpha({ ...baseTool, speedCurve: 0.5 }, baseTouch, linearSize)
    expect(curvedAlpha).toBeGreaterThan(linearAlpha)

    // pathRotationWeight scales path contribution; rotationSmoothing damps delta
    const fullRot = getStepRotation(
      { ...baseTool, pathRotationWeight: 1, rotationSmoothing: 0 },
      baseTouch,
      { rotation: 0 }
    )
    const halfWeightRot = getStepRotation(
      { ...baseTool, pathRotationWeight: 0.5, rotationSmoothing: 0 },
      baseTouch,
      { rotation: 0 }
    )
    const smoothedRot = getStepRotation(
      { ...baseTool, pathRotationWeight: 1, rotationSmoothing: 0.5 },
      baseTouch,
      { rotation: 0 }
    )
    expect(fullRot).toBeCloseTo(1.0, 4)
    expect(halfWeightRot).toBeCloseTo(0.5, 4)
    expect(smoothedRot).toBeCloseTo(0.5, 4)

    // Near ruler freezes rotation regardless of pathRotationWeight
    const rulerRot = getStepRotation(
      { ...baseTool, pathRotationWeight: 0.8 },
      { ...baseTouch, isNearRuler: true },
      { rotation: 0.33 }
    )
    expect(rulerRot).toBeCloseTo(0.33, 4)

    // startTaperFactor reduces start step size and alpha
    const noStartTaper = getStepData(
      { ...baseTool, startTaperFactor: 0, endTaperSizeAmount: 0.5 },
      { ...baseTouch, type: 'start', stepLength: 0 },
      {}
    )
    const withStartTaper = getStepData(
      { ...baseTool, startTaperFactor: 0.6, endTaperSizeAmount: 0.5, endTaperAlphaCurve: 1.5 },
      { ...baseTouch, type: 'start', stepLength: 0 },
      {}
    )
    expect(withStartTaper.size).toBeLessThan(noStartTaper.size)
    expect(withStartTaper.alpha).toBeLessThan(noStartTaper.alpha)

    // endTaperSizeAmount and endTaperAlphaCurve customize end step taper
    const endSmallShrink = getStepData(
      { ...baseTool, endTaperFactor: 0.5, endTaperSizeAmount: 0.1, endTaperAlphaCurve: 0.5 },
      { ...baseTouch, type: 'end' },
      noStartTaper
    )
    const endLargeShrink = getStepData(
      { ...baseTool, endTaperFactor: 0.5, endTaperSizeAmount: 0.8, endTaperAlphaCurve: 2.0 },
      { ...baseTouch, type: 'end' },
      noStartTaper
    )
    expect(endLargeShrink.size).toBeLessThan(endSmallShrink.size)
    expect(endLargeShrink.alpha).not.toBe(endSmallShrink.alpha)

    // Per-tool minAltitudeFactorToHandleRotation in getStepsDataFromTouchEvents (preview path)
    const previewEvents: any[] = [
      {
        type: 'start',
        touchType: TOUCH_TYPE_STYLUS,
        pageX: 10,
        pageY: 10,
        altitudeAngle: 1.15,
        azimuthAngle: 0.9,
      },
      {
        type: 'move',
        touchType: TOUCH_TYPE_STYLUS,
        pageX: 40,
        pageY: 40,
        altitudeAngle: 1.15,
        azimuthAngle: 0.9,
      },
    ]
    const stepsStrictAlt = getStepsDataFromTouchEvents(previewEvents, {
      ...baseTool,
      handleStylusRotation: true,
      handlePathRotation: false,
      minAltitudeFactorToHandleRotation: 0.95,
    })
    const stepsPermissiveAlt = getStepsDataFromTouchEvents(previewEvents, {
      ...baseTool,
      handleStylusRotation: true,
      handlePathRotation: false,
      minAltitudeFactorToHandleRotation: 0.05,
    })
    expect(stepsPermissiveAlt[1].rotation).toBeCloseTo(0.9, 4)
    expect(stepsStrictAlt[1].rotation).toBeCloseTo(stepsStrictAlt[0].rotation, 4)
  })

  it('maintains local vs coworking wire parity and determinism across all frame types with extended rendering parameters', () => {
    const customOverrides = {
      pathRotationWeight: 0.65,
      rotationSmoothing: 0.25,
      stampRotationOffset: 0.35,
      jitterPosition: 0.04,
      jitterSize: 0.05,
      jitterAlpha: 0.06,
      jitterRotation: 0.12,
      jitterAspectRatio: 0.15,
      stampSpacingMode: 'fixed' as const,
      stampSpacingFixedPx: 3.5,
      stampBlur: 6,
      stampScaleX: 1.3,
      stampScaleY: 0.85,
      flow: 0.75,
      buildup: 0.3,
      particleDensity: 0.6,
      sprayDensity: 0.7,
      sprayRadiusFactor: 1.25,
      colorJitterHue: 25,
      colorJitterSat: 0.15,
      colorJitterLight: 0.1,
      stampCompositeOperation: 'source-atop' as GlobalCompositeOperation,
    }

    const frameTypes = [
      TOOL_FRAME_CIRCLE,
      TOOL_FRAME_IMAGE,
      TOOL_FRAME_PARTICLES_RECT,
      TOOL_FRAME_PARTICLES_CIRCLE,
      TOOL_FRAME_SPRAY_CIRCLE,
    ]

    for (const frameType of frameTypes) {
      const localTool = getOneToolVersionCompleteProps('marker', false, {
        color: '#4488cc',
        frameType,
        frameImageName: frameType === TOOL_FRAME_IMAGE ? 'brush-1' : false,
        frameImageFile: frameType === TOOL_FRAME_IMAGE ? ({ width: 32, height: 32 } as any) : null,
        handlePathRotation: true,
        ...customOverrides,
      })

      const remoteTool = getOneToolVersionCompleteProps('marker', false, {
        color: '#4488cc',
        frameType,
        frameImageName: frameType === TOOL_FRAME_IMAGE ? 'brush-1' : false,
        frameImageFile: frameType === TOOL_FRAME_IMAGE ? ({ width: 32, height: 32 } as any) : null,
        handlePathRotation: true,
        ...customOverrides,
      })

      const touchStart = {
        type: 'start' as const,
        touchType: TOUCH_TYPE_STYLUS,
        x: 20,
        y: 30,
        midX: 20,
        midY: 30,
        force: 0.5,
        altitudeFactor: 0.4,
        speedFactor: 0.2,
        azimuthAngle: 0.3,
        pathRotation: 0,
        stepLength: 0,
        canHandleStylusRotation: true,
      }
      const touchMove = {
        ...touchStart,
        type: 'move' as const,
        x: 60,
        y: 70,
        midX: 40,
        midY: 50,
        pathRotation: 0.78,
        stepLength: 42,
      }

      const state: any = { lastStep: {} }
      const s1 = getStepData(localTool, touchStart, state.lastStep)
      updateLastStepData(state, s1)
      const s2 = getStepData(localTool, touchMove, state.lastStep)

      const wireSteps = [s1, s2].map((s) =>
        addTouchStepDataKeys(JSON.parse(JSON.stringify(removeTouchStepDataKeys(s))))
      )

      const makeInstrumentedCtx = () => {
        const mock = createMockCanvasContext()
        ;(mock.ctx.toolImageShape as any) = {
          frameImageName: '',
          color: '',
          canvas: { id: 'stamp-img', width: 32, height: 32 },
          context: {
            fillStyle: '',
            globalCompositeOperation: 'source-over',
            fillRect: () => {},
            drawImage: () => {},
          },
        }
        return mock
      }

      const localMock = makeInstrumentedCtx()
      const localRepeatMock = makeInstrumentedCtx()
      const remoteMock = makeInstrumentedCtx()

      drawStrokeSample(localMock.ctx, s1, localTool, true)
      drawStrokeSample(localMock.ctx, s2, localTool, true)

      drawStrokeSample(localRepeatMock.ctx, s1, localTool, true)
      drawStrokeSample(localRepeatMock.ctx, s2, localTool, true)

      for (const ws of wireSteps) {
        drawStrokeSample(remoteMock.ctx, ws, remoteTool, true)
      }

      expect(localMock.ops.length).toBeGreaterThan(2)
      expect(localRepeatMock.ops).toEqual(localMock.ops)
      expect(remoteMock.ops).toEqual(localMock.ops)
      // Ensure stampBlur and stampCompositeOperation do not leak after drawing
      expect(localMock.ctx.shadowBlur).toBeFalsy()
      expect(localMock.ctx.globalCompositeOperation).toBe('source-over')
    }
  })

  it('draws TOOL_FRAME_SQUARE and TOOL_FRAME_TRIANGLE stamps respecting rotation and aspectRatio', () => {
    const startSample: StrokeSample = {
      type: 'start',
      x: 50,
      y: 60,
      midX: 50,
      midY: 60,
      size: 24,
      alpha: 0.75,
      rotation: 0.4,
      oldSize: 24,
      oldAlpha: 0.75,
      oldRotation: 0,
      oldMidX: 50,
      oldMidY: 60,
      oldX: 50,
      oldY: 60,
      stepLength: 0,
      aspectRatio: 1.5,
      oldAspectRatio: 1.5,
    }
    const moveSample: StrokeSample = {
      ...startSample,
      type: 'move',
      x: 80,
      y: 90,
      midX: 65,
      midY: 75,
      stepLength: 21,
    }

    const squareMock = createMockCanvasContext()
    drawStrokeSample(
      squareMock.ctx,
      startSample,
      {
        frameType: TOOL_FRAME_SQUARE,
        minPxDistanceBetweenFrames: 2,
        sizeToFramesRatio: 0.2,
        color: '#224466',
      },
      true
    )
    drawStrokeSample(
      squareMock.ctx,
      moveSample,
      {
        frameType: TOOL_FRAME_SQUARE,
        minPxDistanceBetweenFrames: 2,
        sizeToFramesRatio: 0.2,
        color: '#224466',
      },
      true
    )
    expect(squareMock.ops.some((o) => o.op === 'fillRect')).toBe(true)
    expect(squareMock.ops.some((o) => o.op === 'rotate')).toBe(true)

    const triMock = createMockCanvasContext()
    drawStrokeSample(
      triMock.ctx,
      startSample,
      {
        frameType: TOOL_FRAME_TRIANGLE,
        minPxDistanceBetweenFrames: 2,
        sizeToFramesRatio: 0.2,
        color: '#664422',
      },
      true
    )
    drawStrokeSample(
      triMock.ctx,
      moveSample,
      {
        frameType: TOOL_FRAME_TRIANGLE,
        minPxDistanceBetweenFrames: 2,
        sizeToFramesRatio: 0.2,
        color: '#664422',
      },
      true
    )
    expect(triMock.ops.some((o) => o.op === 'moveTo')).toBe(true)
    expect(triMock.ops.filter((o) => o.op === 'lineTo').length).toBeGreaterThanOrEqual(2)
    expect(triMock.ops.some((o) => o.op === 'closePath')).toBe(true)
    expect(triMock.ops.some((o) => o.op === 'fill')).toBe(true)
  })
})
