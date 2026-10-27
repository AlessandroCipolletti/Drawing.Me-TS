import { describe, expect, it } from 'vitest'
import { TOUCH_TYPE_STYLUS } from 'main/constants'
import { getStepRotation, StepToolParams } from 'pages/Editor/editorStepMath'
import toolsConfigInit from 'pages/Editor/components/Tools/toolsConfig'

const touch = (overrides: Record<string, unknown> = {}) => ({
  type: 'move',
  x: 50,
  y: 50,
  midX: 50,
  midY: 50,
  stepLength: 20,
  pathRotation: Math.PI / 4,
  ...overrides,
})

describe('path rotation follows the stroke direction', () => {
  it('does not mirror the path angle for finger/mouse input', () => {
    const tool: StepToolParams = {
      size: 40,
      alpha: 0.5,
      minAlpha: 0.05,
      maxAlpha: 1,
      handlePathRotation: true,
      pathRotationWeight: 1,
      rotationSmoothing: 0,
    }
    // Drawing down-right (π/4 in canvas coords) must rotate the stamp by +π/4.
    expect(getStepRotation(tool, touch(), { rotation: 0 })).toBeCloseTo(Math.PI / 4, 4)
    expect(
      getStepRotation(tool, touch({ pathRotation: Math.PI / 2 }), { rotation: 0 })
    ).toBeCloseTo(Math.PI / 2, 4)
  })

  it('directional brush versions follow stylus azimuth, not the path', () => {
    const brush = toolsConfigInit().brush
    const directional = brush.versions.filter(
      (v) => v.props.handleStylusRotation && v.props.handlePathRotation === false
    )
    expect(directional.length).toBeGreaterThan(0)
    for (const version of directional) {
      const tool = {
        ...brush,
        ...version.props,
        rotationSmoothing: 0,
      } as unknown as StepToolParams
      expect(version.props.handleStylusTwist, version.name).toBe(true)
      const rotation = getStepRotation(
        tool,
        touch({
          touchType: TOUCH_TYPE_STYLUS,
          azimuthAngle: 1.2,
          twist: 0,
          hasTwist: false,
          pathRotation: Math.PI / 2,
          canHandleStylusRotation: true,
        }),
        { rotation: 0 }
      )
      // Stamp angle equals the pencil azimuth (1.2), whatever the stroke direction is.
      expect(rotation, version.name).toBeCloseTo(1.2, 4)
    }
  })

  it('new brush versions keep a minimum stamp spacing for small sizes', () => {
    const brush = toolsConfigInit().brush
    for (const version of brush.versions.slice(11)) {
      expect(version.props.minPxDistanceBetweenFrames, version.name).toBeGreaterThanOrEqual(1.5)
    }
  })
})
