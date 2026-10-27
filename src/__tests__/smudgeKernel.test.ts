import { describe, expect, it, vi } from 'vitest'
import { ExtendedCanvasContext, StrokeSample } from 'utils/canvasUtils'
import {
  createSmudgeStrokeSession,
  getSmudgeDabParams,
  getSmudgeCursorSize,
  resetSmudgeStrokeSession,
  smudgeStrokeStep,
  SMUDGE_INPUT_FINGER,
  SMUDGE_INPUT_PEN,
  getSmudgeMemoryLengthPx,
} from 'pages/Editor/smudgeKernel'
import { TOUCH_TYPE_FINGER, TOUCH_TYPE_STYLUS } from 'main/constants'
import { isQuickShapeSupportedTool } from 'pages/Editor/editorQuickShape'
import { addTouchStepDataKeys, removeTouchStepDataKeys } from 'pages/Editor/editorCoworkingBridge'
import { resolveTouchStartAction } from 'pages/Editor/editorPointerRouter'
const makeMockCtx = (): ExtendedCanvasContext => {
  const canvas = { width: 64, height: 64 }
  return {
    canvas,
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as ExtendedCanvasContext
}

const baseStep = (overrides: Partial<StrokeSample>): StrokeSample => ({
  type: 'move',
  x: 32,
  y: 32,
  midX: 32,
  midY: 32,
  size: 24,
  alpha: 0.9,
  rotation: 0,
  oldSize: 24,
  oldAlpha: 0.9,
  oldRotation: 0,
  oldMidX: 30,
  oldMidY: 32,
  oldX: 30,
  oldY: 32,
  stepLength: 2,
  aspectRatio: 1,
  oldAspectRatio: 1,
  ...overrides,
})

describe('smudgeKernel', () => {
  it('uses a wider cursor and stronger drag for pen than finger', () => {
    expect(getSmudgeCursorSize(40, TOUCH_TYPE_FINGER)).toBeGreaterThan(
      getSmudgeCursorSize(40, TOUCH_TYPE_STYLUS)
    )
  })

  it('pen deposits stronger than finger and memory scales with brush size', () => {
    const pen = getSmudgeDabParams(SMUDGE_INPUT_PEN, 0.55, 48)
    const finger = getSmudgeDabParams(SMUDGE_INPUT_FINGER, 0.55, 74)
    // Dabs sit a few px apart for both, so streaks never show stamp spacing.
    expect(pen.spacingRatio).toBeLessThan(0.08)
    expect(finger.spacingRatio).toBeLessThan(0.08)
    expect(pen.deposit).toBeGreaterThan(finger.deposit)
    expect(pen.deposit).toBeGreaterThan(0.4)
    // Memory length is proportional to the effective brush diameter:
    // a finger (bigger effective brush) remembers proportionally farther.
    expect(getSmudgeMemoryLengthPx(48)).toBe(240)
    expect(getSmudgeMemoryLengthPx(24)).toBe(120)
    expect(getSmudgeMemoryLengthPx(96)).toBe(480)
    expect(pen.memoryLengthPx).toBe(getSmudgeMemoryLengthPx(48))
    expect(finger.memoryLengthPx).toBe(getSmudgeMemoryLengthPx(74))
    expect(finger.memoryLengthPx).toBeGreaterThan(pen.memoryLengthPx)
    // Stronger setting = more deposit for both inputs.
    expect(getSmudgeDabParams(SMUDGE_INPUT_PEN, 1).deposit).toBeGreaterThan(pen.deposit)
    expect(getSmudgeDabParams(SMUDGE_INPUT_FINGER, 1).deposit).toBeGreaterThan(finger.deposit)
  })

  it('exchange rate makes picked-up paint survive a size-proportional distance', () => {
    const pen = getSmudgeDabParams(SMUDGE_INPUT_PEN, 0.55, 48)
    const finger = getSmudgeDabParams(SMUDGE_INPUT_FINGER, 0.55, 74)
    const penSpacingPx = 48 * pen.spacingRatio
    const fingerSpacingPx = 74 * finger.spacingRatio
    // Survival distance (spacing / pickup) is a good fraction of the memory
    // window, and scales with brush size through the spacing.
    const penSurvival = penSpacingPx / pen.pickup
    expect(penSurvival).toBeLessThan(pen.memoryLengthPx)
    expect(penSurvival).toBeGreaterThan(pen.memoryLengthPx / 4)
    // Finger exchanges faster, so paint kneads in place: it survives for a
    // smaller fraction of its (larger) memory window.
    expect(finger.pickup).toBeGreaterThan(pen.pickup)
    expect(fingerSpacingPx / finger.pickup / finger.memoryLengthPx).toBeLessThan(
      penSurvival / pen.memoryLengthPx
    )
    // Same relative behaviour at another size: pickup is size-invariant
    // because both spacing and memory scale with the diameter.
    const bigPen = getSmudgeDabParams(SMUDGE_INPUT_PEN, 0.55, 96)
    expect(bigPen.pickup).toBeCloseTo(pen.pickup, 5)
    expect((96 * bigPen.spacingRatio) / bigPen.pickup).toBeGreaterThan(penSurvival)
  })

  it('finger deadzone skips smudge until the stroke moves enough', () => {
    const ctx = makeMockCtx()
    const session = createSmudgeStrokeSession()
    smudgeStrokeStep(
      ctx,
      session,
      baseStep({ type: 'start', x: 32, y: 32, oldX: 32, oldY: 32 }),
      'start',
      SMUDGE_INPUT_FINGER
    )
    const skipped = smudgeStrokeStep(
      ctx,
      session,
      baseStep({ x: 33, y: 32, oldX: 32, oldY: 32, stepLength: 1 }),
      'move',
      SMUDGE_INPUT_FINGER
    )
    expect(skipped).toBe(false)
    expect(ctx.drawImage).not.toHaveBeenCalled()
    resetSmudgeStrokeSession(session)
  })
})

describe('smudge integration', () => {
  it('routes smudge finger on zoomed stylus device to step, not dragZoom', () => {
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
        currentDeviceHasStylus: true,
        touchType: TOUCH_TYPE_FINGER,
        hasZoom: true,
        toolName: 'pencil',
        currentLayerIsActive: true,
      })
    ).toBe('dragZoom')
  })

  it('excludes smudge from quick shape', () => {
    expect(
      isQuickShapeSupportedTool({ name: 'smudge', globalCompositeOperation: 'source-over' })
    ).toBe(false)
  })

  it('round-trips smudge inputKind in coworking wire format', () => {
    const wire = removeTouchStepDataKeys({
      type: 'move',
      x: 1,
      y: 2,
      midX: 1,
      midY: 2,
      size: 10,
      alpha: 0.5,
      rotation: 0,
      oldSize: 10,
      oldAlpha: 0.5,
      oldRotation: 0,
      oldMidX: 0,
      oldMidY: 0,
      oldX: 0,
      oldY: 0,
      stepLength: 1,
      inputKind: SMUDGE_INPUT_FINGER,
    })
    expect(wire[wire.length - 1]).toBe(SMUDGE_INPUT_FINGER)
    const decoded = addTouchStepDataKeys(wire)
    expect(decoded.inputKind).toBe(SMUDGE_INPUT_FINGER)
    expect(decoded.x).toBe(1)
  })
})
