import {
  drawStrokeSample,
  ExtendedCanvasContext,
  StrokeSample,
  StrokeToolParams,
} from 'utils/canvasUtils'
import { guidesState } from './guidesState'
import { expandStepForSymmetry } from './symmetryMath'
import { toolSupportsSymmetry } from './guideTypes'

export const drawStrokeWithGuides = (
  context: ExtendedCanvasContext,
  stepData: StrokeSample,
  tool: StrokeToolParams,
  skipFirst = false
): boolean => {
  const name = tool.name || ''
  if (!toolSupportsSymmetry(name) || guidesState.symmetry === 'off') {
    return drawStrokeSample(context, stepData, tool, skipFirst)
  }
  const variants = expandStepForSymmetry(
    stepData,
    guidesState.symmetry,
    guidesState.originX,
    guidesState.originY,
    guidesState.rotationRad
  )
  let any = false
  for (let i = 0; i < variants.length; i++) {
    any = drawStrokeSample(context, variants[i], tool, i === 0 ? skipFirst : true) || any
  }
  return any
}

export const expandStepsForCoworking = (step: StrokeSample, toolName: string): StrokeSample[] => {
  if (!toolSupportsSymmetry(toolName) || guidesState.symmetry === 'off') {
    return [step]
  }
  return expandStepForSymmetry(
    step,
    guidesState.symmetry,
    guidesState.originX,
    guidesState.originY,
    guidesState.rotationRad
  )
}
