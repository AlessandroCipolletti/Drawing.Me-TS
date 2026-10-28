import Params from 'main/Params'
import { preventDefault } from 'utils/domUtils'
import { round } from 'utils/mathUtils'
import { addHorizontalDragSliderHandler } from 'utils/uiUtils'
import type {
  AdjustmentFilterKind,
  AdjustmentParams,
  BlurParams,
  HsbParams,
  TemperatureParams,
  TintParams,
  VibranceParams,
  SharpnessParams,
  ToneCurveParams,
} from './layerAdjustmentTypes'
import {
  BLUR_RADIUS_MAX,
  BRIGHTNESS_RANGE,
  SHARPNESS_RANGE,
  TEMPERATURE_RANGE,
  TINT_RANGE,
  VIBRANCE_RANGE,
  clampParams,
  defaultParamsForFilter,
  getAdjustmentPipeline,
  type AdjustmentPipelineStep,
} from './layerAdjustmentTypes'
import {
  applyAdjustmentSpec,
  syncAdjustmentSelectionFromActiveSelection,
} from './layerAdjustmentSession'
import { beginAdjustPanelSessionIfIdle, finalizeAdjustPanelSession } from './layerAdjustmentCommit'
import { createAdjustmentLayerForTarget } from './layersActions'
import { layersBridge } from './layersBridge'
import { adjustBarRefs } from './layerAdjustBarRefs'
import { requestAdjustBarReposition } from './layerAdjustBarPosition'
import {
  closeAdjustPanel,
  concealAdjustBar,
  revealAdjustBar,
  setAdjustBarMode,
  setAdjustPanelOpen,
} from './layerAdjustPanelVisibility'
import { findAdjustmentForTarget, layerCanUseAdjust, state, refs } from './layersState'

const FILTER_LABELS: Record<AdjustmentFilterKind, string> = {
  hsb: 'HSB',
  hue: 'Hue',
  saturation: 'Saturation',
  brightness: 'Brightness',
  temperature: 'Temperature',
  tint: 'Tint',
  vibrance: 'Vibrance',
  toneCurve: 'Contrast',
  blur: 'Blur',
  sharpness: 'Sharpness',
}

const sliderUiInitialized = { value: false }
let editFilterKind: AdjustmentFilterKind = 'hue'
let openedFromSelection = false
let selectionActionsRoot: HTMLElement | null = null
let selectionFilterRoot: HTMLElement | null = null
let repositionSelectionBar: (() => void) | null = null

export const registerSelectionFilterPanels = (
  actions: HTMLElement | null,
  filters: HTMLElement | null,
  reposition: () => void
) => {
  selectionActionsRoot = actions
  selectionFilterRoot = filters
  repositionSelectionBar = reposition
}

const showSelectionActions = () => {
  selectionFilterRoot?.classList.add('displayNone')
  selectionActionsRoot?.classList.remove('displayNone')
  repositionSelectionBar?.()
}

const showSelectionFilterList = () => {
  selectionActionsRoot?.classList.add('displayNone')
  selectionFilterRoot?.classList.remove('displayNone')
  repositionSelectionBar?.()
}

const markSelectionFilter = (name: string, selected: boolean, preset = false) => {
  const attr = preset ? 'data-selection-preset' : 'data-selection-filter'
  selectionFilterRoot?.querySelector(`[${attr}="${name}"]`)?.classList.toggle('selected', selected)
}

const getActiveAdjustmentLayerId = (): string | false => {
  const id = state.currentSelectedLayerId
  if (!id) return false
  const layer = state.layers[id]
  if (layer?.layerKind === 'adjustment') return id
  return findAdjustmentForTarget(id)?.id ?? false
}

const paramToSlider = (filter: AdjustmentFilterKind, key: string, raw: number): number => {
  if (filter === 'hue' || (filter === 'hsb' && key === 'hue')) {
    return round(((raw + 180) / 360) * 100, 0)
  }
  if (filter === 'brightness') {
    return round(((raw + BRIGHTNESS_RANGE) / (BRIGHTNESS_RANGE * 2)) * 100, 0)
  }
  if (filter === 'temperature') {
    return round(((raw + TEMPERATURE_RANGE) / (TEMPERATURE_RANGE * 2)) * 100, 0)
  }
  if (filter === 'tint') {
    return round(((raw + TINT_RANGE) / (TINT_RANGE * 2)) * 100, 0)
  }
  if (filter === 'vibrance') {
    return round(((raw + VIBRANCE_RANGE) / (VIBRANCE_RANGE * 2)) * 100, 0)
  }
  if (filter === 'sharpness') {
    return round(((raw + SHARPNESS_RANGE) / (SHARPNESS_RANGE * 2)) * 100, 0)
  }
  if (filter === 'saturation' || filter === 'hsb') {
    return round(((raw + 100) / 200) * 100, 0)
  }
  if (filter === 'toneCurve') return round(((raw + 100) / 200) * 100, 0)
  return round((raw / BLUR_RADIUS_MAX) * 100, 0)
}

const sliderToParam = (filter: AdjustmentFilterKind, key: string, slider: number): number => {
  const t = Math.max(0, Math.min(100, slider))
  if (filter === 'hue' || (filter === 'hsb' && key === 'hue')) {
    return round((t / 100) * 360 - 180, 0)
  }
  if (filter === 'brightness') {
    return round((t / 100) * BRIGHTNESS_RANGE * 2 - BRIGHTNESS_RANGE, 0)
  }
  if (filter === 'temperature') {
    return round((t / 100) * TEMPERATURE_RANGE * 2 - TEMPERATURE_RANGE, 0)
  }
  if (filter === 'tint') {
    return round((t / 100) * TINT_RANGE * 2 - TINT_RANGE, 0)
  }
  if (filter === 'vibrance') {
    return round((t / 100) * VIBRANCE_RANGE * 2 - VIBRANCE_RANGE, 0)
  }
  if (filter === 'sharpness') {
    return round((t / 100) * SHARPNESS_RANGE * 2 - SHARPNESS_RANGE, 0)
  }
  if (filter === 'saturation' || filter === 'hsb') {
    return round((t / 100) * 200 - 100, 0)
  }
  if (filter === 'toneCurve') return round((t / 100) * 200 - 100, 0)
  return round((t / 100) * BLUR_RADIUS_MAX, 0)
}

const setSliderCell = (row: 1 | 2, sliderVal: number, visible: boolean, label = '') => {
  const cell = row === 1 ? adjustBarRefs.adjustSlider1Cell : adjustBarRefs.adjustSlider2Cell
  const labelEl = row === 1 ? adjustBarRefs.adjustSlider1Label : adjustBarRefs.adjustSlider2Label
  const track = row === 1 ? adjustBarRefs.adjustSlider1 : adjustBarRefs.adjustSlider2
  const cursor = row === 1 ? adjustBarRefs.adjustSlider1Cursor : adjustBarRefs.adjustSlider2Cursor
  cell?.classList.toggle('displayNone', !visible)
  if (labelEl) {
    labelEl.textContent = visible ? label : ''
    labelEl.classList.toggle('displayNone', !visible || !label)
  }
  if (cursor) cursor.style.left = `${sliderVal}%`
  if (track) {
    track.style.backgroundImage = `linear-gradient(90deg, var(--palette-gray-1) ${sliderVal}%, var(--palette-gray-6) ${sliderVal}%)`
  }
}

const manualFilterInPipeline = (
  pipeline: AdjustmentPipelineStep[],
  filter: AdjustmentFilterKind
): boolean => pipeline.some((s) => s.filter === filter && !s.presetKey)

const isNeutralManualStep = (step: AdjustmentPipelineStep): boolean => {
  if (step.presetKey) return false
  const current = clampParams(step.filter, step.params)
  const defaults = clampParams(step.filter, defaultParamsForFilter(step.filter))
  return JSON.stringify(current) === JSON.stringify(defaults)
}

const manualFilterActive = (
  pipeline: AdjustmentPipelineStep[],
  filter: AdjustmentFilterKind
): boolean => pipeline.some((s) => s.filter === filter && !s.presetKey && !isNeutralManualStep(s))

const syncPickerHighlight = () => {
  const adjId = getActiveAdjustmentLayerId()
  const spec = adjId ? state.layers[adjId]?.adjustmentSpec : undefined
  const pipeline = spec ? getAdjustmentPipeline(spec) : []
  adjustBarRefs.adjustFilterHue?.classList.toggle('selected', manualFilterActive(pipeline, 'hue'))
  adjustBarRefs.adjustFilterSaturation?.classList.toggle(
    'selected',
    manualFilterActive(pipeline, 'saturation')
  )
  adjustBarRefs.adjustFilterBrightness?.classList.toggle(
    'selected',
    manualFilterActive(pipeline, 'brightness')
  )
  adjustBarRefs.adjustFilterTemperature?.classList.toggle(
    'selected',
    manualFilterActive(pipeline, 'temperature')
  )
  adjustBarRefs.adjustFilterTint?.classList.toggle('selected', manualFilterActive(pipeline, 'tint'))
  adjustBarRefs.adjustFilterVibrance?.classList.toggle(
    'selected',
    manualFilterActive(pipeline, 'vibrance')
  )
  adjustBarRefs.adjustFilterCurve?.classList.toggle(
    'selected',
    manualFilterActive(pipeline, 'toneCurve')
  )
  adjustBarRefs.adjustFilterBlur?.classList.toggle('selected', manualFilterActive(pipeline, 'blur'))
  adjustBarRefs.adjustFilterSharpness?.classList.toggle(
    'selected',
    manualFilterActive(pipeline, 'sharpness')
  )
  markSelectionFilter('hue', manualFilterActive(pipeline, 'hue'))
  markSelectionFilter('saturation', manualFilterActive(pipeline, 'saturation'))
  markSelectionFilter('brightness', manualFilterActive(pipeline, 'brightness'))
  markSelectionFilter('temperature', manualFilterActive(pipeline, 'temperature'))
  markSelectionFilter('tint', manualFilterActive(pipeline, 'tint'))
  markSelectionFilter('vibrance', manualFilterActive(pipeline, 'vibrance'))
  markSelectionFilter('toneCurve', manualFilterActive(pipeline, 'toneCurve'))
  markSelectionFilter('blur', manualFilterActive(pipeline, 'blur'))
  markSelectionFilter('sharpness', manualFilterActive(pipeline, 'sharpness'))
}

const openAdjustBarPicker = (armOffFilter: AdjustmentFilterKind | false = false) => {
  setAdjustBarMode('picker')
  state.adjustManualArmOff = armOffFilter
  setSliderCell(1, 50, false)
  setSliderCell(2, 50, false)
  syncPickerHighlight()
}

export const syncAdjustBarFromLayer = () => {
  const adjId = getActiveAdjustmentLayerId()
  const layer = adjId ? state.layers[adjId] : undefined
  const spec = layer?.adjustmentSpec

  if (!spec || state.adjustBarMode !== 'edit') {
    return
  }

  const filter = editFilterKind
  const pipeline = getAdjustmentPipeline(spec)
  const step =
    pipeline.find((s) => s.filter === filter && !s.presetKey) ??
    pipeline.find((s) => s.filter === filter)
  const params = step?.params ?? spec.params

  adjustBarRefs.adjustBarFilterName?.classList.add('displayNone')

  const label = FILTER_LABELS[filter]
  if (filter === 'hue') {
    const p = params as HsbParams
    setSliderCell(1, paramToSlider('hue', 'hue', p.hue), true, label)
    setSliderCell(2, 0, false)
  } else if (filter === 'saturation') {
    const p = params as HsbParams
    setSliderCell(1, paramToSlider('saturation', 'saturation', p.saturation), true, label)
    setSliderCell(2, 0, false)
  } else if (filter === 'brightness') {
    const p = params as HsbParams
    setSliderCell(1, paramToSlider('brightness', 'brightness', p.brightness), true, label)
    setSliderCell(2, 0, false)
  } else if (filter === 'temperature') {
    const p = params as TemperatureParams
    setSliderCell(1, paramToSlider('temperature', 'amount', p.amount), true, label)
    setSliderCell(2, 0, false)
  } else if (filter === 'tint') {
    const p = params as TintParams
    setSliderCell(1, paramToSlider('tint', 'amount', p.amount), true, label)
    setSliderCell(2, 0, false)
  } else if (filter === 'vibrance') {
    const p = params as VibranceParams
    setSliderCell(1, paramToSlider('vibrance', 'amount', p.amount), true, label)
    setSliderCell(2, 0, false)
  } else if (filter === 'sharpness') {
    const p = params as SharpnessParams
    setSliderCell(1, paramToSlider('sharpness', 'amount', p.amount), true, label)
    setSliderCell(2, 0, false)
  } else if (filter === 'toneCurve') {
    const p = params as ToneCurveParams
    setSliderCell(1, paramToSlider('toneCurve', 'amount', p.amount), true, label)
    setSliderCell(2, 0, false)
  } else {
    const p = params as BlurParams
    setSliderCell(1, paramToSlider('blur', 'radius', p.radius), true, label)
    setSliderCell(2, 0, false)
  }
}

const updateParamFromSlider = (row: 1 | 2, sliderVal: number, inProgress: boolean) => {
  const adjId = getActiveAdjustmentLayerId()
  if (!adjId) return
  const layer = state.layers[adjId]
  const spec = layer?.adjustmentSpec
  if (!spec) return

  const filter = editFilterKind
  let next: AdjustmentParams
  if (filter === 'hue') {
    next = clampParams('hue', {
      hue: sliderToParam('hue', 'hue', sliderVal),
      saturation: 0,
      brightness: 0,
    }) as HsbParams
  } else if (filter === 'saturation') {
    next = clampParams('saturation', {
      hue: 0,
      saturation: sliderToParam('saturation', 'saturation', sliderVal),
      brightness: 0,
    }) as HsbParams
  } else if (filter === 'brightness') {
    next = clampParams('brightness', {
      hue: 0,
      saturation: 0,
      brightness: sliderToParam('brightness', 'brightness', sliderVal),
    }) as HsbParams
  } else if (filter === 'temperature') {
    next = clampParams('temperature', {
      amount: sliderToParam('temperature', 'amount', sliderVal),
    }) as TemperatureParams
  } else if (filter === 'tint') {
    next = clampParams('tint', {
      amount: sliderToParam('tint', 'amount', sliderVal),
    }) as TintParams
  } else if (filter === 'vibrance') {
    next = clampParams('vibrance', {
      amount: sliderToParam('vibrance', 'amount', sliderVal),
    }) as VibranceParams
  } else if (filter === 'sharpness') {
    next = clampParams('sharpness', {
      amount: sliderToParam('sharpness', 'amount', sliderVal),
    }) as SharpnessParams
  } else if (filter === 'toneCurve') {
    next = clampParams('toneCurve', {
      amount: sliderToParam('toneCurve', 'amount', sliderVal),
    }) as ToneCurveParams
  } else {
    next = clampParams('blur', {
      radius: sliderToParam('blur', 'radius', sliderVal),
    }) as BlurParams
  }
  applyAdjustmentSpec(adjId, { filter: editFilterKind, params: next }, { interactive: inProgress })
  if (!inProgress) syncAdjustBarFromLayer()
  else {
    const cursor = row === 1 ? adjustBarRefs.adjustSlider1Cursor : adjustBarRefs.adjustSlider2Cursor
    const track = row === 1 ? adjustBarRefs.adjustSlider1 : adjustBarRefs.adjustSlider2
    if (cursor) cursor.style.left = `${sliderVal}%`
    if (track) {
      track.style.backgroundImage = `linear-gradient(90deg, var(--palette-gray-1) ${sliderVal}%, var(--palette-gray-6) ${sliderVal}%)`
    }
  }
}

const ensureAdjustmentLayer = async (): Promise<string | false> => {
  let adjId = getActiveAdjustmentLayerId()
  if (adjId) {
    syncAdjustmentSelectionFromActiveSelection(adjId)
    return adjId
  }
  const targetId = state.currentSelectedLayerId
  if (!targetId || !layerCanUseAdjust(targetId)) return false
  adjId = (await createAdjustmentLayerForTarget(targetId, 'hsb')) ?? false
  return adjId
}

const focusFilterStep = (adjId: string, filter: AdjustmentFilterKind) => {
  const cur = state.layers[adjId]?.adjustmentSpec
  if (!cur) return
  let pipeline = getAdjustmentPipeline(cur)
  let step = pipeline.find((s) => s.filter === filter && !s.presetKey)
  if (!step) {
    step = pipeline.find((s) => s.filter === filter)
  }
  if (!step) {
    step = { filter, params: defaultParamsForFilter(filter) }
    pipeline = [...pipeline, step]
  }
  applyAdjustmentSpec(adjId, {
    pipeline,
    filter,
    params: { ...step.params },
  })
}

const removeManualFilterSteps = async (adjId: string, filter: AdjustmentFilterKind) => {
  const spec = state.layers[adjId]?.adjustmentSpec
  if (!spec) return
  const next = getAdjustmentPipeline(spec).filter((s) => !(s.filter === filter && !s.presetKey))
  if (!next.length) {
    const targetId = state.layers[adjId]?.maskBelowLayerId
    if (targetId) {
      await layersBridge._deleteLayer(adjId, targetId, false, { keepAdjustPanel: true })
    }
  } else {
    applyAdjustmentSpec(adjId, { pipeline: next })
  }
}

const dropNeutralManualSteps = async () => {
  const adjId = getActiveAdjustmentLayerId()
  if (!adjId) return
  const spec = state.layers[adjId]?.adjustmentSpec
  if (!spec) return
  const pipeline = getAdjustmentPipeline(spec)
  const next = pipeline.filter((s) => !isNeutralManualStep(s))
  if (next.length === pipeline.length) return
  if (!next.length) {
    const targetId = state.layers[adjId]?.maskBelowLayerId
    if (targetId) {
      await layersBridge._deleteLayer(adjId, targetId, false, { keepAdjustPanel: true })
    }
    return
  }
  applyAdjustmentSpec(adjId, { pipeline: next })
}

const enableManualFilterNeutral = (adjId: string, filter: AdjustmentFilterKind) => {
  const cur = state.layers[adjId]?.adjustmentSpec
  if (!cur) return
  const pipeline = getAdjustmentPipeline(cur)
  if (manualFilterInPipeline(pipeline, filter)) return
  const next: AdjustmentPipelineStep[] = [
    ...pipeline,
    { filter, params: defaultParamsForFilter(filter) },
  ]
  applyAdjustmentSpec(adjId, { pipeline: next })
}

const onFilterType = async (filter: AdjustmentFilterKind) => {
  const adjId = await ensureAdjustmentLayer()
  if (!adjId) return
  const spec = state.layers[adjId]?.adjustmentSpec
  const pipeline = spec ? getAdjustmentPipeline(spec) : []
  if (!manualFilterInPipeline(pipeline, filter)) {
    enableManualFilterNeutral(adjId, filter)
  }
  editFilterKind = filter
  focusFilterStep(adjId, filter)
  setAdjustBarMode('edit')
  state.adjustManualArmOff = false
  syncAdjustBarFromLayer()
  if (openedFromSelection) revealAdjustBar()
  requestAdjustBarReposition()
}

const onResetFilter = async () => {
  const adjId = getActiveAdjustmentLayerId()
  if (!adjId) return
  const spec = state.layers[adjId]?.adjustmentSpec
  if (!spec) return
  const filter = editFilterKind || spec.filter
  await removeManualFilterSteps(adjId, filter)
  if (openedFromSelection) {
    concealAdjustBar()
    showSelectionFilterList()
    syncPickerHighlight()
    return
  }
  openAdjustBarPicker(false)
  requestAdjustBarReposition()
}

const returnToSelectionActions = async () => {
  openedFromSelection = false
  showSelectionActions()
  await dropNeutralManualSteps()
  if (state.adjustPanelOpen) closeAdjustPanel()
  else void finalizeAdjustPanelSession()
}

export const enterSelectionFilters = () => {
  openedFromSelection = true
  beginAdjustPanelSessionIfIdle()
  showSelectionFilterList()
  syncPickerHighlight()
}

export const dismissSelectionFilters = () => {
  if (!openedFromSelection && selectionFilterRoot?.classList.contains('displayNone')) return
  if (!openedFromSelection) {
    showSelectionActions()
    return
  }
  void returnToSelectionActions()
}

const onSelectionFilterPointer = (e: Event) => {
  const target = e.target instanceof Element ? e.target : null
  const filterEl = target?.closest('[data-selection-filter]')
  if (!filterEl) return
  preventDefault(e)
  const kind = filterEl.getAttribute('data-selection-filter')
  if (kind === 'back') {
    void returnToSelectionActions()
    return
  }
  if (
    kind === 'hue' ||
    kind === 'saturation' ||
    kind === 'brightness' ||
    kind === 'temperature' ||
    kind === 'tint' ||
    kind === 'vibrance' ||
    kind === 'toneCurve' ||
    kind === 'blur' ||
    kind === 'sharpness'
  ) {
    void onFilterType(kind)
  }
}

export const initLayerAdjustmentBar = () => {
  if (sliderUiInitialized.value) return
  sliderUiInitialized.value = true

  const wireSlider = (row: 1 | 2) => {
    const cursor = row === 1 ? adjustBarRefs.adjustSlider1Cursor : adjustBarRefs.adjustSlider2Cursor
    const track = row === 1 ? adjustBarRefs.adjustSlider1 : adjustBarRefs.adjustSlider2
    if (!cursor || !track) return
    addHorizontalDragSliderHandler(
      cursor,
      track,
      (value, inProgress) => updateParamFromSlider(row, value, inProgress),
      100,
      0,
      false,
      0
    )
  }
  wireSlider(1)
  wireSlider(2)
  selectionFilterRoot?.addEventListener(Params.eventStart, onSelectionFilterPointer)

  const tap = (handler: () => void) => (e: Event) => {
    preventDefault(e)
    void handler()
  }

  adjustBarRefs.adjustFilterHue?.addEventListener(
    Params.eventStart,
    tap(() => onFilterType('hue'))
  )
  adjustBarRefs.adjustFilterSaturation?.addEventListener(
    Params.eventStart,
    tap(() => onFilterType('saturation'))
  )
  adjustBarRefs.adjustFilterBrightness?.addEventListener(
    Params.eventStart,
    tap(() => onFilterType('brightness'))
  )
  adjustBarRefs.adjustFilterTemperature?.addEventListener(
    Params.eventStart,
    tap(() => onFilterType('temperature'))
  )
  adjustBarRefs.adjustFilterTint?.addEventListener(
    Params.eventStart,
    tap(() => onFilterType('tint'))
  )
  adjustBarRefs.adjustFilterVibrance?.addEventListener(
    Params.eventStart,
    tap(() => onFilterType('vibrance'))
  )
  adjustBarRefs.adjustFilterCurve?.addEventListener(
    Params.eventStart,
    tap(() => onFilterType('toneCurve'))
  )
  adjustBarRefs.adjustFilterBlur?.addEventListener(
    Params.eventStart,
    tap(() => onFilterType('blur'))
  )
  adjustBarRefs.adjustFilterSharpness?.addEventListener(
    Params.eventStart,
    tap(() => onFilterType('sharpness'))
  )
  adjustBarRefs.adjustBarReset?.addEventListener(
    Params.eventStart,
    tap(() => onResetFilter())
  )
  adjustBarRefs.adjustBarBack?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    void (async () => {
      await dropNeutralManualSteps()
      if (openedFromSelection) {
        concealAdjustBar()
        showSelectionFilterList()
        syncPickerHighlight()
        return
      }
      openAdjustBarPicker(false)
      requestAdjustBarReposition()
    })()
  })
  adjustBarRefs.adjustBarClose?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    void (async () => {
      await dropNeutralManualSteps()
      const fromSelection = openedFromSelection
      closeAdjustPanel()
      if (fromSelection) {
        openedFromSelection = false
        showSelectionActions()
      }
    })()
  })
}

export const adjustParamsButtonTouchStart = (e: Event) => {
  preventDefault(e)
  if (refs.adjustParamsButton?.classList.contains('disabled')) return
  const opening = !state.adjustPanelOpen
  if (!opening) {
    void (async () => {
      await dropNeutralManualSteps()
      closeAdjustPanel()
    })()
    return
  }
  setAdjustPanelOpen(true)
  openAdjustBarPicker()
}
