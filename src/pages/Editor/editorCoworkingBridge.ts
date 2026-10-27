import * as Coworking from 'modules/Coworking'
import * as Layers from './components/Layers'
import { syncLayerDisplayDuringStroke } from './components/Layers/layerMask'
import * as Tools from './components/Tools'
import { round } from 'utils/mathUtils'
import {
  type BucketFillOptions,
  fillCompletely,
  ExtendedCanvasContext,
  StrokeSample,
  StrokeToolParams,
} from 'utils/canvasUtils'
import { drawMultipleCoworkingSteps } from './editorUtils'
import { fillActiveLayerWithBucketAt } from './bucketFillPipeline'
import { smudgeTouchTypeToInputKind } from './smudgeKernel'
import { CoworkingStepsPayload, EditorState } from './editorTypes'

const stepDataKeys: Array<keyof StrokeSample> = [
  'type',
  'x',
  'y',
  'midX',
  'midY',
  'size',
  'alpha',
  'rotation',
  'oldSize',
  'oldAlpha',
  'oldRotation',
  'oldMidX',
  'oldMidY',
  'oldX',
  'oldY',
  'stepLength',
  'aspectRatio',
  'oldAspectRatio',
  'strokeDistance',
  'force',
]

const toStepNumber = (value: string | number | null | undefined, fallback = Number.NaN): number =>
  typeof value === 'number' ? value : fallback

export const addTouchStepDataKeys = (
  stepDataArray: Array<string | number | null | undefined>
): StrokeSample => {
  const step: StrokeSample = {
    type: stepDataArray[0] as StrokeSample['type'],
    x: toStepNumber(stepDataArray[1]),
    y: toStepNumber(stepDataArray[2]),
    midX: toStepNumber(stepDataArray[3]),
    midY: toStepNumber(stepDataArray[4]),
    size: toStepNumber(stepDataArray[5]),
    alpha: toStepNumber(stepDataArray[6]),
    rotation: toStepNumber(stepDataArray[7]),
    oldSize: toStepNumber(stepDataArray[8]),
    oldAlpha: toStepNumber(stepDataArray[9]),
    oldRotation: toStepNumber(stepDataArray[10]),
    oldMidX: toStepNumber(stepDataArray[11]),
    oldMidY: toStepNumber(stepDataArray[12]),
    oldX: toStepNumber(stepDataArray[13]),
    oldY: toStepNumber(stepDataArray[14]),
    stepLength: toStepNumber(stepDataArray[15]),
    aspectRatio: toStepNumber(stepDataArray[16], 1),
    oldAspectRatio: toStepNumber(stepDataArray[17], 1),
    strokeDistance: toStepNumber(stepDataArray[18], 0),
    force: toStepNumber(stepDataArray[19], 0),
  }
  const wireInputKind = stepDataArray[20]
  if (typeof wireInputKind === 'number' && !Number.isNaN(wireInputKind)) {
    step.inputKind = wireInputKind
  }
  const wireColorDropTol = stepDataArray[21]
  if (typeof wireColorDropTol === 'number' && !Number.isNaN(wireColorDropTol)) {
    step.colorDropUserTolerance = wireColorDropTol
  }
  const wireColorDropSoft = stepDataArray[22]
  if (typeof wireColorDropSoft === 'number') {
    step.colorDropSoftFill = wireColorDropSoft === 1
  }
  return step
}

export const removeTouchStepDataKeys = (
  stepData: Partial<StrokeSample>
): Array<string | number | undefined> => {
  const wire: Array<string | number | undefined> = stepDataKeys.map((key) => {
    const e = stepData[key]
    if (typeof e === 'number') return round(e, 4)
    if (typeof e === 'string') return e
    return undefined
  })
  if (typeof stepData.inputKind === 'number') {
    wire.push(stepData.inputKind)
  }
  if (typeof stepData.colorDropUserTolerance === 'number') {
    wire.push(round(stepData.colorDropUserTolerance, 0))
  }
  if (typeof stepData.colorDropSoftFill === 'boolean') {
    wire.push(stepData.colorDropSoftFill ? 1 : 0)
  }
  return wire
}

const withSmudgeCoworkingFields = (
  state: EditorState,
  stepData: Partial<StrokeSample>
): Partial<StrokeSample> => {
  if (state.currentToolProps.name !== 'smudge') {
    return stepData
  }
  return {
    ...stepData,
    inputKind: smudgeTouchTypeToInputKind(state.currentTouch.type),
  }
}

const globalCompositeOperationValues: GlobalCompositeOperation[] = [
  'source-over',
  'destination-out',
  'source-atop',
]

interface WireToolData {
  name: string
  version: string | number | undefined
  color: string | false
  globalCompositeOperation: GlobalCompositeOperation | undefined
  frameImageName: string | false
  customProps: Record<string, unknown>
}

const addToolDataKeys = (toolDataArray: CoworkingStepsPayload['tool']): WireToolData => ({
  name: toolDataArray[0],
  version: toolDataArray[1],
  color: toolDataArray[2],
  globalCompositeOperation: globalCompositeOperationValues[toolDataArray[3]],
  frameImageName: toolDataArray[4],
  customProps: toolDataArray[5],
})

const removeToolDataKeys = (toolData: WireToolData): CoworkingStepsPayload['tool'] => [
  toolData.name,
  toolData.version,
  toolData.color,
  toolData.globalCompositeOperation
    ? globalCompositeOperationValues.indexOf(toolData.globalCompositeOperation)
    : -1,
  toolData.frameImageName,
  toolData.customProps,
]

const receiveBucketFromCoworker = async (
  layerId: string,
  x: number,
  y: number,
  color: string,
  step?: StrokeSample
) => {
  const context = Layers.getLayerContext(layerId)
  const bucketOpts: BucketFillOptions = {}
  if (typeof step?.colorDropUserTolerance === 'number') {
    bucketOpts.userTolerance = step.colorDropUserTolerance
  }
  if (typeof step?.colorDropSoftFill === 'boolean') {
    bucketOpts.boundariesWeekModeOverride = step.colorDropSoftFill
  }
  if (Layers.isYourLayerEmpty(layerId)) {
    fillCompletely(context, color, context.canvas.width, context.canvas.height)
  } else {
    const res = fillActiveLayerWithBucketAt(layerId, x, y, color, bucketOpts)
    if (res) await res
  }
  await Layers.addLayerHistoryContentChangedStep(layerId)
}

export const sendCoworkingBucketFill = (
  state: EditorState,
  layerId: string,
  x: number,
  y: number,
  color: string
) => {
  Coworking.clearSteps()
  state.stepsSinceLastCoworkingUpdate = 0
  const step: Partial<StrokeSample> = { type: 'start', x, y }
  Coworking.addStep(
    removeTouchStepDataKeys(step as Partial<StrokeSample>) as unknown as StrokeSample
  )
  const toolData = removeToolDataKeys({
    name: 'bucket',
    version: state.currentToolProps.version,
    color,
    globalCompositeOperation: state.currentToolProps.globalCompositeOperation,
    frameImageName: false,
    customProps: {},
  })
  Coworking.sendSteps(layerId, toolData)
}

export const drawCoworkingStepsPayload = async (
  data: CoworkingStepsPayload,
  callbacks: {
    start: (ctx: ExtendedCanvasContext, step: StrokeSample, tool: StrokeToolParams) => boolean
    move: (ctx: ExtendedCanvasContext, step: StrokeSample, tool: StrokeToolParams) => boolean
    end: (ctx: ExtendedCanvasContext, step: StrokeSample, tool: StrokeToolParams) => boolean
  }
) => {
  if (data.replaceStroke) {
    await Layers.restoreLayerBeforeStrokeForCoworker(data.layerId, data.replaceStroke)
  }
  await drawMultipleCoworkingSteps(
    data.layerId,
    data.steps.map(addTouchStepDataKeys),
    addToolDataKeys(data.tool),
    {
      ...callbacks,
      bucket: receiveBucketFromCoworker,
    }
  )
  syncLayerDisplayDuringStroke(data.layerId)
  if (data.replaceStroke === 'last') {
    await Layers.replaceLatestLayerHistoryContentStep(data.layerId)
  } else if (data.steps.find((step) => step[0] === 'end')) {
    requestAnimationFrame(() => Layers.addLayerHistoryContentChangedStep(data.layerId))
  }
}

export const sendCoworkingQuickShapeSteps = (
  state: EditorState,
  steps: StrokeSample[],
  replaceStroke: 'current' | 'last' = 'current'
) => {
  Coworking.clearSteps()
  state.stepsSinceLastCoworkingUpdate = 0
  for (const step of steps) {
    Coworking.addStep(removeTouchStepDataKeys(step) as unknown as StrokeSample)
  }
  const toolData = removeToolDataKeys({
    name: state.currentToolProps.name,
    version: state.currentToolProps.version,
    color: state.currentToolProps.color,
    globalCompositeOperation: state.currentToolProps.globalCompositeOperation,
    frameImageName: state.currentToolProps.frameImageName,
    customProps: Tools.getCurrentToolCustomProps() as Record<string, unknown>,
  })
  Coworking.sendSteps(Layers.getCurrentSelectedLayerId(), toolData, replaceStroke)
}

export const sendCoworkingStep = (
  state: EditorState,
  stepData: Partial<StrokeSample>,
  saveStep = false
) => {
  if (saveStep) {
    const toolData = removeToolDataKeys({
      name: state.currentToolProps.name,
      version: state.currentToolProps.version,
      color: state.currentToolProps.color,
      globalCompositeOperation: state.currentToolProps.globalCompositeOperation,
      frameImageName: state.currentToolProps.frameImageName,
      customProps: Tools.getCurrentToolCustomProps() as Record<string, unknown>,
    })
    if (stepData) {
      Coworking.addStep(
        removeTouchStepDataKeys(
          withSmudgeCoworkingFields(state, stepData)
        ) as unknown as StrokeSample
      )
    }
    Coworking.sendSteps(Layers.getCurrentSelectedLayerId(), toolData)
    state.stepsSinceLastCoworkingUpdate = 0
  } else {
    Coworking.addStep(
      removeTouchStepDataKeys(withSmudgeCoworkingFields(state, stepData)) as unknown as StrokeSample
    )
    state.stepsSinceLastCoworkingUpdate += 1
  }
}
