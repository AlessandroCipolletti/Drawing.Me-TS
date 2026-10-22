import { describe, expect, it, vi } from 'vitest'
import Params from 'main/Params'
import {
  resolveTouchStartAction,
  resolveTouchMoveAction,
  resolveTouchEndAction,
} from 'pages/Editor/editorPointerRouter'
import { runCoalescedStepTouchMove } from 'pages/Editor/editorStrokeSession'
import { TOUCH_TYPE_STYLUS, TOUCH_TYPE_FINGER } from 'main/constants'
import { handlePointerEvents } from 'utils/pointerEventsUtils'
import { getOneToolVersionCompleteProps } from 'pages/Editor/components/Tools/toolsPersistence'
import { addTouchStepDataKeys, removeTouchStepDataKeys } from 'pages/Editor/editorCoworkingBridge'
import { CurrentToolProps } from 'pages/Editor/editorTypes'
import { toolDefaultProps } from 'pages/Editor/config'

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
})
