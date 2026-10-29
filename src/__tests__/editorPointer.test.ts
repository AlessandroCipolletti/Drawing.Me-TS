import { describe, expect, it, vi } from 'vitest'
import Params from 'main/Params'
import {
  resolveTouchStartAction,
  resolveTouchMoveAction,
  resolveTouchEndAction,
} from 'pages/Editor/editorPointerRouter'
import {
  applyLassoClipPath,
  clearPolygonFromCanvas,
  fillPolygonOnCanvas,
  floodFillMagicWandMask,
  getLassoBezierCurvePoints,
  traceMaskBoundaryRings,
} from 'pages/Editor/components/Layers/layerLasso'
import { runCoalescedStepTouchMove } from 'pages/Editor/editorStrokeSession'
import {
  buildQuickShapeStrokeSamples,
  computeQuickShapeGeometry,
  detectQuickShape,
  isQuickShapeSupportedTool,
  QuickShapeInputPoint,
} from 'pages/Editor/editorQuickShape'
import History from 'modules/History'
import { TOUCH_TYPE_STYLUS, TOUCH_TYPE_FINGER } from 'main/constants'
import { handlePointerEvents } from 'utils/pointerEventsUtils'
import { getOneToolVersionCompleteProps } from 'pages/Editor/components/Tools/toolsPersistence'
import { addTouchStepDataKeys, removeTouchStepDataKeys } from 'pages/Editor/editorCoworkingBridge'
import { CurrentToolProps } from 'pages/Editor/editorTypes'
import { toolDefaultProps } from 'pages/Editor/config'
import {
  computeGradientFactorAtPoint,
  hitTestGradientEndpoint,
  isGradientDragValid,
  paintGradientFillOnContext,
  renderGradientGuideOverlay,
  resolveDefaultGradientColors,
  sampleGradientColorAtPoint,
  selectExclusiveGradientKind,
  syncGradientKindButtons,
} from 'pages/Editor/gradientFill'
import { toolSupportsSymmetry } from 'pages/Editor/guides/guideTypes'

describe('Editor pointer dispatch & coalesced 120Hz stroke safety net', () => {
  it('routes touchStart deterministically across resize, stylus/finger zoom, pipette, and stroke', () => {
    expect(
      resolveTouchStartAction({
        isResizing: true,
        resizeModeActive: true,
        currentDeviceHasStylus: false,
        touchType: TOUCH_TYPE_FINGER,
        hasZoom: false,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('none')

    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: true,
        currentDeviceHasStylus: false,
        touchType: TOUCH_TYPE_FINGER,
        hasZoom: false,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('dragLayer')

    // On a device that has seen Apple Pencil, a finger touch when zoomed pans/zooms instead of drawing
    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_FINGER,
        hasZoom: true,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('dragZoom')

    // Stylus touch when zoomed still draws a stroke
    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_STYLUS,
        hasZoom: true,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('step')

    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_FINGER,
        hasZoom: true,
        toolName: 'smudge',
        currentLayerIsActive: true,
      })
    ).toBe('step')

    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        currentDeviceHasStylus: false,
        touchType: TOUCH_TYPE_FINGER,
        hasZoom: false,
        toolName: 'pipette',
        currentLayerIsActive: true,
      })
    ).toBe('pipette')

    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        currentDeviceHasStylus: false,
        touchType: TOUCH_TYPE_FINGER,
        hasZoom: false,
        toolName: 'pencil',
        currentLayerIsActive: false,
      })
    ).toBe('none')

    const prevIsDesktop = Params.isDesktop
    try {
      Params.isDesktop = true
      expect(
        resolveTouchStartAction({
          isResizing: false,
          resizeModeActive: false,
          desktopCanvasPanMode: true,
          pointerType: 'mouse',
          currentDeviceHasStylus: false,
          touchType: TOUCH_TYPE_FINGER,
          hasZoom: false,
          toolName: 'pencil',
          currentLayerIsActive: true,
        })
      ).toBe('panCanvas')

      expect(
        resolveTouchMoveAction({
          isResizing: false,
          resizeModeActive: false,
          desktopCanvasPanMode: true,
          pointerType: 'mouse',
          isZooming: true,
          currentDeviceHasStylus: false,
          touchType: TOUCH_TYPE_FINGER,
          toolName: 'pencil',
          currentLayerIsActive: true,
        })
      ).toBe('panCanvas')

      expect(
        resolveTouchEndAction({
          isResizing: false,
          resizeModeActive: false,
          desktopCanvasPanMode: true,
          pointerType: 'mouse',
          currentDeviceHasStylus: false,
          isZooming: true,
          toolName: 'pencil',
          currentLayerIsActive: true,
        })
      ).toBe('panCanvas')

      Params.isDesktop = false
      expect(
        resolveTouchStartAction({
          isResizing: false,
          resizeModeActive: false,
          desktopCanvasPanMode: true,
          pointerType: 'mouse',
          currentDeviceHasStylus: false,
          touchType: TOUCH_TYPE_FINGER,
          hasZoom: false,
          toolName: 'pencil',
          currentLayerIsActive: true,
        })
      ).toBe('step')
    } finally {
      Params.isDesktop = prevIsDesktop
    }
  })

  it('routes touchMove and touchEnd consistently with touchStart', () => {
    expect(
      resolveTouchMoveAction({
        isResizing: false,
        resizeModeActive: false,
        isZooming: true,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_FINGER,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('dragZoom')

    expect(
      resolveTouchMoveAction({
        isResizing: false,
        resizeModeActive: false,
        isZooming: false,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_STYLUS,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('step')

    expect(
      resolveTouchEndAction({
        isResizing: false,
        resizeModeActive: false,
        currentDeviceHasStylus: true,
        isZooming: true,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('dragZoom')

    expect(
      resolveTouchEndAction({
        isResizing: false,
        resizeModeActive: false,
        currentDeviceHasStylus: false,
        isZooming: false,
        toolName: 'pipette',
        currentLayerIsActive: true,
      })
    ).toBe('pipette')

    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_STYLUS,
        hasZoom: true,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('lasso')

    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_FINGER,
        hasZoom: true,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('dragZoom')

    expect(
      resolveTouchMoveAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        isZooming: false,
        currentDeviceHasStylus: false,
        touchType: TOUCH_TYPE_FINGER,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('lasso')

    expect(
      resolveTouchEndAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        currentDeviceHasStylus: false,
        isZooming: false,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('lasso')
  })

  it('iterates all coalescedSamples in order when coalescedSamples.length > 1', () => {
    const visited: number[] = []
    const sample1 = { id: 1 }
    const sample2 = { id: 2 }
    const sample3 = { id: 3 }
    const sample4 = { id: 4 }

    runCoalescedStepTouchMove(
      { id: 0, coalescedSamples: [sample1, sample2, sample3, sample4] },
      (s) => visited.push(s.id)
    )
    expect(visited).toEqual([1, 2, 3, 4])

    const singleVisited: number[] = []
    runCoalescedStepTouchMove({ id: 99 }, (s) => singleVisited.push(s.id))
    expect(singleVisited).toEqual([99])
  })

  it('registers and unregisters pointer listeners cleanly via handlePointerEvents cleanup', () => {
    class MockElement {
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    const prevElement = globalThis.Element
    globalThis.Element = MockElement as unknown as typeof Element
    try {
      const touchLayer = new MockElement() as unknown as HTMLElement
      const cleanup = handlePointerEvents(touchLayer, {
        onSingleTouchStart: () => {},
        onSingleTouchMove: () => {},
        onSingleTouchEnd: () => {},
      })

      expect(touchLayer.addEventListener).toHaveBeenCalled()
      cleanup()
      expect(touchLayer.removeEventListener).toHaveBeenCalled()
    } finally {
      globalThis.Element = prevElement
    }
  })

  it('preserves selected color and randomColor when merging getOneToolVersionCompleteProps on tool or slider change', () => {
    const activeToolState: CurrentToolProps = {
      ...toolDefaultProps,
      color: '#FF0000',
      randomColor: false,
    }
    const nextToolProps = getOneToolVersionCompleteProps('marker', 0, { size: 32 })
    const merged: CurrentToolProps = {
      ...activeToolState,
      ...nextToolProps,
    }

    expect(merged.color).toBe('#FF0000')
    expect(merged.randomColor).toBe(false)
    expect(merged.size).toBe(32)
    expect(merged.name).toBe('marker')
  })

  it('deserializes JSON-null empty end coworking stroke steps with NaN stepLength so no spurious (0,0) stamp is drawn', () => {
    // Simulate JSON round-trip of an empty end marker: ['end', undefined, ...] -> ['end', null, ...]
    const wireEndStep = JSON.parse(
      JSON.stringify(removeTouchStepDataKeys({ type: 'end' }))
    ) as Array<string | number | null>

    const decoded = addTouchStepDataKeys(wireEndStep)

    expect(decoded.type).toBe('end')
    expect(Number.isNaN(decoded.stepLength)).toBe(true)
    expect(Number.isNaN(decoded.x)).toBe(true)
    expect(Number.isNaN(decoded.y)).toBe(true)
  })

  it('interpolates sparse fast-cursor lasso points into a smooth quadratic Bezier curve', () => {
    const sparseAnchors: Array<[number, number]> = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]
    const openCurve = getLassoBezierCurvePoints(sparseAnchors, false)
    expect(openCurve.length).toBeGreaterThan(20)
    expect(openCurve[0]).toEqual([0, 0])
    expect(openCurve[openCurve.length - 1]).toEqual([0, 100])
    // Corner at (100, 0) should be smoothly rounded around (75, 25) instead of hitting (100, 0)
    const hitsSharpCorner = openCurve.some(([x, y]) => x === 100 && y === 0)
    expect(hitsSharpCorner).toBe(false)
  })

  it('detects QuickShape primitives (line, arc, polyline, circle, ellipse, triangle, rect/square) and transforms variants cleanly', () => {
    const toInput = (pts: Array<[number, number]>): QuickShapeInputPoint[] =>
      pts.map(([x, y]) => ({
        x,
        y,
        size: 16,
        alpha: 0.75,
        rotation: 0,
        aspectRatio: 1,
      }))

    expect(
      isQuickShapeSupportedTool({ name: 'pencil', globalCompositeOperation: 'source-over' })
    ).toBe(true)
    expect(
      isQuickShapeSupportedTool({ name: 'eraser', globalCompositeOperation: 'destination-out' })
    ).toBe(false)
    expect(isQuickShapeSupportedTool({ name: 'bucket' })).toBe(false)
    expect(isQuickShapeSupportedTool({ name: 'gradient' })).toBe(false)
    expect(isQuickShapeSupportedTool({ name: 'text' })).toBe(false)
    expect(isQuickShapeSupportedTool({ name: 'magicWand' })).toBe(false)
    expect(toolSupportsSymmetry('gradient')).toBe(false)
    expect(toolSupportsSymmetry('text')).toBe(false)

    // 1. Straight line with minor hand tremor: connects start to end directly, only offers line & freehand
    const linePts: Array<[number, number]> = []
    for (let i = 0; i <= 20; i++) {
      linePts.push([100 + i * 10, 100 + i * 5 + (i % 2 === 0 ? 1 : -1)])
    }
    const lineDet = detectQuickShape(toInput(linePts), 1)
    expect(lineDet?.defaultVariant).toBe('line')
    expect(lineDet?.availableVariants).toEqual(['line', 'freehand'])
    const lineGeom = computeQuickShapeGeometry(lineDet!, 'line')
    expect(lineGeom.waypoints).toEqual([linePts[0], linePts[linePts.length - 1]])

    // 2. Single-arch circular arc
    const arcPts: Array<[number, number]> = []
    for (let i = 0; i <= 30; i++) {
      const t = (i / 30) * Math.PI
      arcPts.push([200 + 120 * Math.cos(t), 200 - 90 * Math.sin(t)])
    }
    const arcDet = detectQuickShape(toInput(arcPts), 1)
    expect(arcDet?.defaultVariant).toBe('arc')
    expect(arcDet?.availableVariants).toEqual(['arc', 'freehand'])
    const arcGeom = computeQuickShapeGeometry(arcDet!, 'arc')
    expect(arcGeom.waypoints.length).toBeGreaterThan(10)

    // 3. Closed circle & ellipse (only ellipse, circle, freehand — no rect/square)
    const circlePts: Array<[number, number]> = []
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * 2 * Math.PI
      circlePts.push([300 + 80 * Math.cos(a), 300 + 78 * Math.sin(a)])
    }
    const circleDet = detectQuickShape(toInput(circlePts), 1)
    expect(circleDet?.defaultVariant).toBe('circle')
    expect(circleDet?.availableVariants).toEqual(['ellipse', 'circle', 'freehand'])

    const ellipsePts: Array<[number, number]> = []
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * 2 * Math.PI
      ellipsePts.push([300 + 130 * Math.cos(a), 300 + 60 * Math.sin(a)])
    }
    const ellipseDet = detectQuickShape(toInput(ellipsePts), 1)
    expect(ellipseDet?.defaultVariant).toBe('ellipse')
    expect(ellipseDet?.availableVariants).toEqual(['ellipse', 'circle', 'freehand'])

    // 4. Closed triangle (no circle offered)
    const triCorners: Array<[number, number]> = [
      [200, 100],
      [340, 300],
      [80, 290],
      [200, 100],
    ]
    const triPts: Array<[number, number]> = []
    for (let edge = 0; edge < 3; edge++) {
      const a = triCorners[edge]
      const b = triCorners[edge + 1]
      for (let s = 0; s < 16; s++) {
        const t = s / 16
        triPts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      }
    }
    triPts.push(triCorners[0])
    const triDet = detectQuickShape(toInput(triPts), 1)
    expect(['triangle', 'equilateral']).toContain(triDet?.defaultVariant)
    expect(triDet?.availableVariants).toEqual(['triangle', 'equilateral', 'freehand'])
    expect(triDet?.availableVariants).not.toContain('circle')

    // 5. Closed rectangle & square conversion (no circle offered)
    const rectCorners: Array<[number, number]> = [
      [100, 100],
      [320, 100],
      [320, 220],
      [100, 220],
      [100, 100],
    ]
    const rectPts: Array<[number, number]> = []
    for (let edge = 0; edge < 4; edge++) {
      const a = rectCorners[edge]
      const b = rectCorners[edge + 1]
      for (let s = 0; s < 14; s++) {
        const t = s / 14
        rectPts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      }
    }
    rectPts.push(rectCorners[0])
    const rectDet = detectQuickShape(toInput(rectPts), 1)
    expect(rectDet?.defaultVariant).toBe('rect')
    expect(rectDet?.availableVariants).toEqual(['rect', 'square', 'quad', 'freehand'])
    expect(rectDet?.availableVariants).not.toContain('circle')
    const squareGeom = computeQuickShapeGeometry(rectDet!, 'square')
    expect(squareGeom.closed).toBe(true)
    expect(squareGeom.waypoints).toHaveLength(5)

    // 6. Closed pentagon & regularPentagon
    const pentCorners: Array<[number, number]> = []
    for (let k = 0; k <= 5; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5
      pentCorners.push([250 + 100 * Math.cos(a), 250 + 100 * Math.sin(a)])
    }
    const pentPts: Array<[number, number]> = []
    for (let edge = 0; edge < 5; edge++) {
      const a = pentCorners[edge]
      const b = pentCorners[edge + 1]
      for (let s = 0; s < 12; s++) {
        const t = s / 12
        pentPts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      }
    }
    pentPts.push(pentCorners[0])
    const pentDet = detectQuickShape(toInput(pentPts), 1)
    expect(pentDet?.defaultVariant).toBe('regularPentagon')
    expect(pentDet?.availableVariants).toEqual(['pentagon', 'regularPentagon', 'freehand'])
    const regPentGeom = computeQuickShapeGeometry(pentDet!, 'regularPentagon')
    expect(regPentGeom.waypoints).toHaveLength(6)

    // 7. Closed hexagon & regularHexagon
    const hexCorners: Array<[number, number]> = []
    for (let k = 0; k <= 6; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 6
      hexCorners.push([250 + 110 * Math.cos(a), 250 + 110 * Math.sin(a)])
    }
    const hexPts: Array<[number, number]> = []
    for (let edge = 0; edge < 6; edge++) {
      const a = hexCorners[edge]
      const b = hexCorners[edge + 1]
      for (let s = 0; s < 12; s++) {
        const t = s / 12
        hexPts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      }
    }
    hexPts.push(hexCorners[0])
    const hexDet = detectQuickShape(toInput(hexPts), 1)
    expect(hexDet?.defaultVariant).toBe('regularHexagon')
    expect(hexDet?.availableVariants).toEqual(['hexagon', 'regularHexagon', 'freehand'])
    const regHexGeom = computeQuickShapeGeometry(hexDet!, 'regularHexagon')
    expect(regHexGeom.waypoints).toHaveLength(7)

    const samples = buildQuickShapeStrokeSamples(
      squareGeom.waypoints,
      squareGeom.closed,
      rectDet!.style,
      toolDefaultProps
    )
    expect(samples.length).toBeGreaterThan(4)
    expect(samples[0].type).toBe('start')
    expect(samples[samples.length - 1].type).toBe('end')

    // 8. History.replaceCurrent replaces top step in-place for single-undo QuickShape variant switching
    const deleted: number[] = []
    const hist = new History<number>(10, (item) => deleted.push(item))
    hist.add(10)
    hist.add(20)
    expect(hist.getCurrent()).toBe(20)
    expect(hist.getPrevious()).toBe(10)
    hist.replaceCurrent(25)
    expect(hist.getCurrent()).toBe(25)
    expect(hist.getPrevious()).toBe(10)
    expect(deleted).toEqual([20])
    expect(hist.back()).toBe(10)
  })

  it('supports closed lasso stroke clipping, invert evenodd clip, fill, and clear', () => {
    // Once a lasso selection is closed (lassoHasSelection: true), strokes route to 'step' so brushes clip inside the selection
    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        lassoHasSelection: true,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_STYLUS,
        hasZoom: true,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('step')

    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        lassoCapture: false,
        lassoHasSelection: true,
        currentDeviceHasStylus: false,
        touchType: 'mouse',
        hasZoom: false,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('step')

    expect(
      resolveTouchMoveAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        lassoHasSelection: true,
        isZooming: false,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_STYLUS,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('step')

    expect(
      resolveTouchEndAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        lassoHasSelection: true,
        currentDeviceHasStylus: true,
        isZooming: false,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('step')

    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: true,
        lassoModeActive: true,
        lassoHasSelection: true,
        lassoMoveMode: true,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_STYLUS,
        hasZoom: true,
        toolName: 'magicWand',
        currentLayerIsActive: true,
      })
    ).toBe('dragLayer')

    expect(
      resolveTouchMoveAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        lassoHasSelection: true,
        lassoMoveMode: true,
        isZooming: false,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_STYLUS,
        toolName: 'magicWand',
        currentLayerIsActive: true,
      })
    ).toBe('lassoMove')

    expect(
      resolveTouchEndAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        lassoHasSelection: true,
        currentDeviceHasStylus: true,
        isZooming: false,
        toolName: 'magicWand',
        currentLayerIsActive: true,
      })
    ).toBe('lasso')

    // When Move mode is toggled on inside an active lasso selection, drags route to 'lassoMove' while keeping the selection active
    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        lassoHasSelection: true,
        lassoMoveMode: true,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_STYLUS,
        hasZoom: true,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('lassoMove')

    expect(
      resolveTouchMoveAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        lassoHasSelection: true,
        lassoMoveMode: true,
        isZooming: false,
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_STYLUS,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('lassoMove')

    expect(
      resolveTouchEndAction({
        isResizing: false,
        resizeModeActive: false,
        lassoModeActive: true,
        lassoHasSelection: true,
        lassoMoveMode: true,
        currentDeviceHasStylus: true,
        isZooming: false,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('lassoMove')

    // Clip, fill, and clear support both normal ('nonzero') and inverted ('evenodd') winding rules
    const clipRules: string[] = []
    const fillRules: Array<string | undefined> = []
    const mockCtx = {
      canvas: { width: 200, height: 200 },
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      fillStyle: '#000000',
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn((rule?: string) => clipRules.push(rule || 'nonzero')),
      fill: vi.fn((rule?: string) => fillRules.push(rule)),
    } as unknown as CanvasRenderingContext2D

    const triangle: Array<[number, number]> = [
      [20, 20],
      [120, 20],
      [70, 120],
    ]
    applyLassoClipPath(mockCtx, triangle, false)
    applyLassoClipPath(mockCtx, triangle, true)
    expect(clipRules).toEqual(['nonzero', 'evenodd'])

    fillPolygonOnCanvas(mockCtx, triangle, '#ff0000', { inverted: false })
    fillPolygonOnCanvas(mockCtx, triangle, '#00ff00', { inverted: true })
    clearPolygonFromCanvas(mockCtx, triangle, { inverted: true })
    expect(fillRules).toEqual([undefined, 'evenodd', 'evenodd'])

    // Magic wand bucket flood fill (tolerance 0..255, varying brush alpha, and contour + hole tracing)
    const w = 16
    const h = 16
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4
        if (x >= 3 && x <= 12 && y >= 3 && y <= 12) {
          if (x >= 6 && x <= 9 && y >= 6 && y <= 9) {
            // Inner island of a different color (creates a hole at low tolerance)
            rgba[idx] = 200
            rgba[idx + 1] = 20
            rgba[idx + 2] = 20
            rgba[idx + 3] = 255
          } else {
            // Ring with slight color gradient (diff 0 at seed, 30 on outer band) and varying brush alpha
            const band = x === 3 || x === 12 || y === 3 || y === 12 ? 30 : 0
            rgba[idx] = 20 + band
            rgba[idx + 1] = 100
            rgba[idx + 2] = 200
            rgba[idx + 3] = x % 2 === 0 ? 255 : 90
          }
        }
      }
    }

    const tol0 = floodFillMagicWandMask(rgba, w, h, 4, 4, 0, false)
    expect(tol0.minX).toBe(4)
    expect(tol0.maxX).toBe(11)
    expect(tol0.mask[4 * w + 5]).toBe(1)
    expect(tol0.mask[6 * w + 6]).toBe(0)
    const tol40 = floodFillMagicWandMask(rgba, w, h, 4, 4, 40, false)
    expect(tol40.minX).toBe(3)
    expect(tol40.maxX).toBe(12)
    expect(tol40.mask[6 * w + 6]).toBe(0)

    const rings40 = traceMaskBoundaryRings(tol40.mask, w, h, tol40, 1, 1)
    expect(rings40.length).toBe(2)

    const tol255 = floodFillMagicWandMask(rgba, w, h, 4, 4, 255, false)
    expect(tol255.minX).toBe(0)
    expect(tol255.maxX).toBe(15)
    expect(tol255.mask[6 * w + 6]).toBe(1)
  })

  it('routes gradient tool pointer actions, enforces exclusive types, rejects short drags, hit-tests endpoints, and maps linear/radial/angular colours', () => {
    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        currentDeviceHasStylus: false,
        touchType: TOUCH_TYPE_FINGER,
        hasZoom: false,
        toolName: 'gradient',
        currentLayerIsActive: true,
      })
    ).toBe('gradient')
    expect(
      resolveTouchMoveAction({
        isResizing: false,
        resizeModeActive: false,
        isZooming: false,
        currentDeviceHasStylus: false,
        touchType: TOUCH_TYPE_FINGER,
        toolName: 'gradient',
        currentLayerIsActive: true,
      })
    ).toBe('gradient')
    expect(
      resolveTouchEndAction({
        isResizing: false,
        resizeModeActive: false,
        currentDeviceHasStylus: false,
        isZooming: false,
        toolName: 'gradient',
        currentLayerIsActive: true,
      })
    ).toBe('gradient')
    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        currentDeviceHasStylus: false,
        touchType: TOUCH_TYPE_FINGER,
        hasZoom: false,
        toolName: 'gradient',
        currentLayerIsActive: false,
      })
    ).toBe('none')
    expect(
      resolveTouchStartAction({
        isResizing: false,
        resizeModeActive: false,
        currentDeviceHasStylus: false,
        touchType: TOUCH_TYPE_FINGER,
        hasZoom: false,
        toolName: 'text',
        currentLayerIsActive: true,
      })
    ).toBe('text')
    expect(
      resolveTouchMoveAction({
        isResizing: false,
        resizeModeActive: false,
        isZooming: false,
        currentDeviceHasStylus: false,
        touchType: TOUCH_TYPE_FINGER,
        toolName: 'text',
        currentLayerIsActive: true,
      })
    ).toBe('text')
    expect(
      resolveTouchEndAction({
        isResizing: false,
        resizeModeActive: false,
        currentDeviceHasStylus: false,
        isZooming: false,
        toolName: 'text',
        currentLayerIsActive: false,
      })
    ).toBe('none')

    // Short drag rejection
    expect(isGradientDragValid(100, 100, 102, 101)).toBe(false)
    expect(isGradientDragValid(100, 100, 106, 100)).toBe(true)

    // Endpoint hit-testing
    expect(hitTestGradientEndpoint(103, 98, 100, 100, 300, 100, 24)).toBe('start')
    expect(hitTestGradientEndpoint(295, 104, 100, 100, 300, 100, 24)).toBe('end')
    expect(hitTestGradientEndpoint(200, 100, 100, 100, 300, 100, 24)).toBeNull()

    // Exclusive type buttons & default colours
    const makeBtnStub = () => {
      const classes = new Set<string>()
      return {
        classList: {
          toggle: (cls: string, force?: boolean) => {
            const on = force ?? !classes.has(cls)
            if (on) classes.add(cls)
            else classes.delete(cls)
            return on
          },
          contains: (cls: string) => classes.has(cls),
        },
      } as unknown as HTMLElement
    }
    const linearBtn = makeBtnStub()
    const radialBtn = makeBtnStub()
    const angularBtn = makeBtnStub()
    const buttons = { linear: linearBtn, radial: radialBtn, angular: angularBtn }

    let activeKind = selectExclusiveGradientKind('linear', 'radial')
    syncGradientKindButtons(buttons, activeKind)
    expect(activeKind).toBe('radial')
    expect(linearBtn.classList.contains('selected')).toBe(false)
    expect(radialBtn.classList.contains('selected')).toBe(true)
    expect(angularBtn.classList.contains('selected')).toBe(false)

    activeKind = selectExclusiveGradientKind(activeKind, 'angular')
    syncGradientKindButtons(buttons, activeKind)
    expect(radialBtn.classList.contains('selected')).toBe(false)
    expect(angularBtn.classList.contains('selected')).toBe(true)

    expect(resolveDefaultGradientColors('#ff0000')).toEqual({
      color1: '#ff0000',
      color2: '#ffffff',
    })
    expect(resolveDefaultGradientColors('#ffffff')).toEqual({
      color1: '#ffffff',
      color2: '#000000',
    })

    // Linear mapping: before start -> colour 1, midpoint -> blend, after end -> colour 2
    const linearSpec = {
      kind: 'linear' as const,
      x0: 100,
      y0: 100,
      x1: 200,
      y1: 100,
      color1: '#ff0000',
      color2: '#0000ff',
    }
    expect(computeGradientFactorAtPoint('linear', 100, 100, 200, 100, 40, 100)).toBe(0)
    expect(computeGradientFactorAtPoint('linear', 100, 100, 200, 100, 150, 100)).toBeCloseTo(0.5, 5)
    expect(computeGradientFactorAtPoint('linear', 100, 100, 200, 100, 260, 100)).toBe(1)
    expect(sampleGradientColorAtPoint(linearSpec, 40, 180)).toEqual([255, 0, 0])
    expect(sampleGradientColorAtPoint(linearSpec, 150, 180)).toEqual([128, 0, 128])
    expect(sampleGradientColorAtPoint(linearSpec, 260, 180)).toEqual([0, 0, 255])

    // Radial mapping: centre -> colour 1, half radius -> blend, on and outside ring -> colour 2
    const radialSpec = {
      ...linearSpec,
      kind: 'radial' as const,
    }
    expect(sampleGradientColorAtPoint(radialSpec, 100, 100)).toEqual([255, 0, 0])
    expect(sampleGradientColorAtPoint(radialSpec, 100, 150)).toEqual([128, 0, 128])
    expect(sampleGradientColorAtPoint(radialSpec, 200, 100)).toEqual([0, 0, 255])
    expect(sampleGradientColorAtPoint(radialSpec, 260, 100)).toEqual([0, 0, 255])

    // Angular mapping: dragged ray -> colour 1, perpendicular rays -> blend, opposite ray -> colour 2
    const angularSpec = {
      ...linearSpec,
      kind: 'angular' as const,
    }
    expect(sampleGradientColorAtPoint(angularSpec, 180, 100)).toEqual([255, 0, 0])
    expect(sampleGradientColorAtPoint(angularSpec, 100, 180)).toEqual([128, 0, 128])
    expect(sampleGradientColorAtPoint(angularSpec, 100, 20)).toEqual([128, 0, 128])
    expect(sampleGradientColorAtPoint(angularSpec, 20, 100)).toEqual([0, 0, 255])

    // Canvas paint helper configures gradient stops and respects opacity
    const stops: Array<[number, string]> = []
    const mockGrad = {
      addColorStop: vi.fn((offset: number, color: string) => stops.push([offset, color])),
    } as unknown as CanvasGradient
    const fillRect = vi.fn()
    const mockGradCtx = {
      canvas: { width: 300, height: 200 },
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      fillStyle: '#000000',
      createLinearGradient: vi.fn(() => mockGrad),
      createRadialGradient: vi.fn(() => mockGrad),
      createConicGradient: vi.fn(() => mockGrad),
      fillRect,
    } as unknown as CanvasRenderingContext2D

    paintGradientFillOnContext(mockGradCtx, {
      ...linearSpec,
      opacity: 0.6,
    })
    expect(stops).toEqual([
      [0, '#ff0000'],
      [1, '#0000ff'],
    ])
    expect(fillRect).toHaveBeenCalledWith(0, 0, 300, 200)

    const clipOrder: string[] = []
    const clippedCtx = {
      canvas: { width: 300, height: 200 },
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      fillStyle: '#000000',
      save: () => clipOrder.push('save'),
      restore: () => clipOrder.push('restore'),
      createLinearGradient: vi.fn(() => mockGrad),
      fillRect: () => clipOrder.push('fill'),
    } as unknown as CanvasRenderingContext2D
    paintGradientFillOnContext(
      clippedCtx,
      { ...linearSpec, opacity: 1 },
      { clipToSelection: () => clipOrder.push('clip') }
    )
    expect(clipOrder).toEqual(['save', 'clip', 'fill', 'restore'])

    // Guide axis is clipped to the layer mask; endpoint dots stay so they can be dragged
    const guideOps: string[] = []
    let guideGco = 'source-over'
    const guideCtx = {
      clearRect: () => guideOps.push('clear'),
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      arc: () => guideOps.push('dot'),
      fill: () => {},
      setLineDash: () => {},
      drawImage: () => guideOps.push(`draw:${guideGco}`),
      get globalCompositeOperation() {
        return guideGco
      },
      set globalCompositeOperation(value: string) {
        guideGco = value
      },
      globalAlpha: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      lineWidth: 1,
      strokeStyle: '#000',
      fillStyle: '#000',
    }
    const guideCanvas = {
      width: 300,
      height: 200,
      classList: { add() {}, remove() {} },
      getContext: () => guideCtx,
    } as unknown as HTMLCanvasElement
    const clipMask = { width: 300, height: 200 } as HTMLCanvasElement
    renderGradientGuideOverlay(guideCanvas, { ...linearSpec, opacity: 1 }, 1, clipMask)
    const maskAt = guideOps.indexOf('draw:destination-in')
    const firstDot = guideOps.indexOf('dot')
    expect(maskAt).toBeGreaterThan(-1)
    expect(firstDot).toBeGreaterThan(maskAt)

    guideOps.length = 0
    renderGradientGuideOverlay(guideCanvas, { ...linearSpec, opacity: 1 }, 1, null)
    expect(guideOps.some((op) => op.startsWith('draw:'))).toBe(false)
  })
})
