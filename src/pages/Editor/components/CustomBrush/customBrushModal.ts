import './customBrushModal.css'

import Params from 'main/Params'
import { spacing } from 'main/Theme'
import * as Messages from 'modules/Messages'
import * as ColorPicker from 'pages/Editor/components/ColorPicker'
import { toolDefaultProps } from 'pages/Editor/config'
import { TOOL_FRAME_CIRCLE, TOOL_FRAME_IMAGE } from 'pages/Editor/constants'
import { CurrentToolProps } from 'pages/Editor/editorTypes'
import { normalizeToolDrawParams } from 'utils/canvasUtils'
import { preventDefault } from 'utils/domUtils'
import { getImageFromUrl } from 'utils/imageUtils'
import { deepCopy } from 'utils/jsUtils'
import { logarithmicPercToValue, logarithmicValueToPerc, round } from 'utils/mathUtils'
import { addHorizontalDragSliderHandler } from 'utils/uiUtils'
import { CustomBrushModalRefs, CustomBrushModalView } from './CustomBrushModalView'
import {
  clampAndRoundSchemaValue,
  CUSTOM_BRUSH_FRAME_OPTIONS,
  CUSTOM_BRUSH_PARAM_SCHEMA,
  CustomBrushParamSchemaEntry,
  formatSchemaNumber,
  PARAM_SECTIONS,
} from './customBrushParamSchema'
import {
  createCustomBrushPreviewController,
  CustomBrushPreviewController,
} from './customBrushPreview'
import {
  addCustomBrush,
  getCustomBrushById,
  getCustomBrushIndexById,
  getDefaultCustomBrushDraft,
  getHydratedCustomBrushImage,
  limitStampSourceSize,
  isCustomBrushSupported,
  removeCustomBrush,
  setHydratedCustomBrushImage,
  updateCustomBrush,
} from './customBrushStore'
import type { CustomBrushDraftProps } from './customBrushTypes'
import { createCustomFrameEditorController, CustomFrameEditorController } from './customFrameEditor'

const PREVIEW_CANVAS_LOGICAL_REM = 30

export interface OpenCustomBrushModalOptions {
  mode: 'create' | 'edit'
  brushId?: string
  onSaved?: (index: number) => void
  onDeleted?: (nextIndex: number | false) => void
}

const getActiveEditorColor = (): string => {
  const palette = ColorPicker.getCurrentColorsPalette?.() || []
  const selectedId = ColorPicker.getCurrentSelectedColorId?.() ?? -1
  const found = palette.find((c) => c.id === selectedId)
  return found?.finalHex || palette[0]?.finalHex || '#0f172a'
}

const createEmptyRefs = (): CustomBrushModalRefs => ({
  root: null,
  paramsPane: null,
  previewPane: null,
  previewCanvas: null,
  resetPreviewBtn: null,
  frameButtons: {},
  fileInput: null,
  imageThumbWrap: null,
  imageThumbImg: null,
  reuploadImageBtn: null,
  redrawFrameBtn: null,
  sectionContainers: {},
  sectionBodies: {},
  sectionToggleHeaders: {},
  controls: {},
  deleteBtn: null,
  cancelBtn: null,
  saveBtn: null,
  frameEditor: {
    overlay: null,
    canvas: null,
    sizeSlider: null,
    sizeCursor: null,
    sizeValueLabel: null,
    opacitySlider: null,
    opacityCursor: null,
    opacityValueLabel: null,
    clearBtn: null,
    cancelBtn: null,
    saveBtn: null,
  },
})

const setSliderVisual = (
  entry: CustomBrushParamSchemaEntry,
  slider: HTMLElement | null,
  cursor: HTMLElement | null,
  valueLabel: HTMLElement | null,
  rawValue: unknown
) => {
  const min = entry.min ?? 0
  const max = entry.max ?? 1
  const numVal =
    typeof rawValue === 'number' && Number.isFinite(rawValue)
      ? Math.min(max, Math.max(min, rawValue))
      : min
  const perc =
    entry.scale === 'log'
      ? logarithmicValueToPerc(Math.max(min, numVal), min, max, 2)
      : max > min
        ? ((numVal - min) / (max - min)) * 100
        : 0
  const clampedPerc = Math.max(0, Math.min(100, round(perc, 2)))
  if (cursor) cursor.style.left = `${clampedPerc}%`
  if (slider) {
    slider.style.backgroundImage = `linear-gradient(90deg, var(--palette-gray-1) ${clampedPerc}%, var(--palette-gray-6) ${clampedPerc}%)`
  }
  if (valueLabel) {
    valueLabel.textContent = formatSchemaNumber(entry, numVal)
  }
}

export const openCustomBrushModal = async (options: OpenCustomBrushModalOptions): Promise<void> => {
  if (!isCustomBrushSupported()) return

  const { mode, brushId, onSaved, onDeleted } = options
  const existing = mode === 'edit' && brushId ? getCustomBrushById(brushId) : undefined
  if (mode === 'edit' && !existing) return

  const brushIndex = existing ? getCustomBrushIndexById(existing.id) : -1
  const brushNumber = brushIndex >= 0 ? brushIndex + 1 : undefined

  const draft: CustomBrushDraftProps = {
    ...deepCopy(getDefaultCustomBrushDraft()),
    ...(existing ? deepCopy(existing.props) : {}),
  }
  if (existing?.customProps) {
    if (typeof existing.customProps.size === 'number') {
      draft.size = existing.customProps.size
    }
    if (typeof existing.customProps.alpha === 'number') {
      draft.alpha = existing.customProps.alpha
    }
  }

  let draftImageElement: HTMLImageElement | HTMLCanvasElement | null =
    existing && draft.frameType === TOOL_FRAME_IMAGE
      ? getHydratedCustomBrushImage(existing.id)
      : null
  let draftImageRevision = 1
  let activeFrameOptionId =
    draft.frameType === TOOL_FRAME_IMAGE ? 'image' : String(draft.frameType || TOOL_FRAME_CIRCLE)

  const refs = createEmptyRefs()
  const modalRoot = CustomBrushModalView({
    mode,
    brushNumber,
    draft,
    refs,
  })

  const buildPreviewToolProps = (): CurrentToolProps => {
    const hasValidImage = Boolean(draft.frameType === TOOL_FRAME_IMAGE && draftImageElement)
    const effectiveFrameType =
      draft.frameType === TOOL_FRAME_IMAGE && !hasValidImage
        ? TOOL_FRAME_CIRCLE
        : draft.frameType || TOOL_FRAME_CIRCLE

    const rawProps: CurrentToolProps = {
      ...toolDefaultProps,
      ...(draft as Partial<CurrentToolProps>),
      name: 'customBrush',
      frameType: effectiveFrameType,
      frameImageName: hasValidImage ? `cb-preview-${draftImageRevision}` : false,
      frameImageFile: hasValidImage ? draftImageElement : null,
      color: getActiveEditorColor(),
      randomColor: false,
    }
    return normalizeToolDrawParams(rawProps)
  }

  let previewController: CustomBrushPreviewController | null = null
  let frameEditorController: CustomFrameEditorController | null = null

  const syncFrameTilesAndImageBar = () => {
    for (const [id, el] of Object.entries(refs.frameButtons)) {
      el.classList.toggle('cb-frame-tile--active', id === activeFrameOptionId)
    }
    const isImageFrame = draft.frameType === TOOL_FRAME_IMAGE
    if (refs.imageThumbWrap) {
      refs.imageThumbWrap.classList.toggle('displayNone', !isImageFrame)
    }
    if (refs.imageThumbImg) {
      if (isImageFrame && draft.frameImageBase64) {
        refs.imageThumbImg.src = draft.frameImageBase64
        refs.imageThumbImg.classList.remove('displayNone')
      } else {
        refs.imageThumbImg.removeAttribute('src')
        refs.imageThumbImg.classList.add('displayNone')
      }
    }
  }

  const syncConditionalVisibility = () => {
    for (const section of PARAM_SECTIONS) {
      const entries = CUSTOM_BRUSH_PARAM_SCHEMA.filter((e) => e.section === section.id)
      let visibleCount = 0
      for (const entry of entries) {
        const ctrl = refs.controls[String(entry.key)]
        const visible = entry.visibleWhen ? entry.visibleWhen(draft) : true
        if (ctrl?.row) {
          ctrl.row.classList.toggle('displayNone', !visible)
        }
        if (visible) visibleCount++
      }
      const secEl = refs.sectionContainers[section.id]
      if (secEl) {
        secEl.classList.toggle('displayNone', visibleCount === 0)
      }
    }
  }

  const syncSingleSlider = (key: keyof CustomBrushDraftProps) => {
    const entry = CUSTOM_BRUSH_PARAM_SCHEMA.find((e) => e.key === key)
    const ctrl = refs.controls[String(key)]
    if (!entry || !ctrl) return
    setSliderVisual(entry, ctrl.slider, ctrl.cursor, ctrl.valueLabel, draft[key])
  }

  const enforceMinMaxCoherence = (changedKey: keyof CustomBrushDraftProps) => {
    if (changedKey === 'minSize' || changedKey === 'maxSize') {
      const minS = typeof draft.minSize === 'number' ? draft.minSize : 1
      const maxS = typeof draft.maxSize === 'number' ? draft.maxSize : 400
      if (changedKey === 'minSize' && minS > maxS) {
        draft.maxSize = minS
        syncSingleSlider('maxSize')
      } else if (changedKey === 'maxSize' && maxS < minS) {
        draft.minSize = maxS
        syncSingleSlider('minSize')
      }
      const curS = typeof draft.size === 'number' ? draft.size : 25
      const clampedS = Math.min(draft.maxSize ?? 400, Math.max(draft.minSize ?? 1, curS))
      if (clampedS !== curS) {
        draft.size = clampedS
        syncSingleSlider('size')
      }
    } else if (changedKey === 'size') {
      const curS = typeof draft.size === 'number' ? draft.size : 25
      if (typeof draft.minSize === 'number' && curS < draft.minSize) {
        draft.minSize = curS
        syncSingleSlider('minSize')
      }
      if (typeof draft.maxSize === 'number' && curS > draft.maxSize) {
        draft.maxSize = curS
        syncSingleSlider('maxSize')
      }
    } else if (changedKey === 'minAlpha' || changedKey === 'maxAlpha') {
      const minA = typeof draft.minAlpha === 'number' ? draft.minAlpha : 0.001
      const maxA = typeof draft.maxAlpha === 'number' ? draft.maxAlpha : 1
      if (changedKey === 'minAlpha' && minA > maxA) {
        draft.maxAlpha = minA
        syncSingleSlider('maxAlpha')
      } else if (changedKey === 'maxAlpha' && maxA < minA) {
        draft.minAlpha = maxA
        syncSingleSlider('minAlpha')
      }
      const curA = typeof draft.alpha === 'number' ? draft.alpha : 0.3
      const clampedA = Math.min(draft.maxAlpha ?? 1, Math.max(draft.minAlpha ?? 0.001, curA))
      if (clampedA !== curA) {
        draft.alpha = clampedA
        syncSingleSlider('alpha')
      }
    } else if (changedKey === 'alpha') {
      const curA = typeof draft.alpha === 'number' ? draft.alpha : 0.3
      if (typeof draft.minAlpha === 'number' && curA < draft.minAlpha) {
        draft.minAlpha = curA
        syncSingleSlider('minAlpha')
      }
      if (typeof draft.maxAlpha === 'number' && curA > draft.maxAlpha) {
        draft.maxAlpha = curA
        syncSingleSlider('maxAlpha')
      }
    } else if (changedKey === 'minAspectRatio' || changedKey === 'maxAspectRatio') {
      const minAr = typeof draft.minAspectRatio === 'number' ? draft.minAspectRatio : 0.2
      const maxAr = typeof draft.maxAspectRatio === 'number' ? draft.maxAspectRatio : 5
      if (changedKey === 'minAspectRatio' && minAr > maxAr) {
        draft.maxAspectRatio = minAr
        syncSingleSlider('maxAspectRatio')
      } else if (changedKey === 'maxAspectRatio' && maxAr < minAr) {
        draft.minAspectRatio = maxAr
        syncSingleSlider('minAspectRatio')
      }
    }
  }

  const paramDefaults = getDefaultCustomBrushDraft()

  for (const entry of CUSTOM_BRUSH_PARAM_SCHEMA) {
    const key = String(entry.key)
    const ctrl = refs.controls[key]
    if (!ctrl) continue

    if (entry.kind === 'slider' && ctrl.cursor && ctrl.slider) {
      setSliderVisual(entry, ctrl.slider, ctrl.cursor, ctrl.valueLabel, draft[entry.key])
      const sliderMax = entry.scale === 'log' ? 100 : (entry.max ?? 1)
      const sliderMin = entry.scale === 'log' ? 0 : (entry.min ?? 0)
      addHorizontalDragSliderHandler(
        ctrl.cursor,
        ctrl.slider,
        (rawVal: number) => {
          const mapped =
            entry.scale === 'log'
              ? logarithmicPercToValue(
                  rawVal,
                  entry.min ?? 0.001,
                  entry.max ?? 1,
                  entry.decimals ?? 3
                )
              : rawVal
          const val = clampAndRoundSchemaValue(entry, mapped)
          ;(draft as Record<string, unknown>)[key] = val
          setSliderVisual(entry, ctrl.slider, ctrl.cursor, ctrl.valueLabel, val)
          enforceMinMaxCoherence(entry.key)
          previewController?.requestLatestRender()
        },
        sliderMax,
        sliderMin,
        false,
        entry.scale === 'log' ? 2 : (entry.decimals ?? 3)
      )
    } else if (entry.kind === 'toggle' && ctrl.row) {
      ctrl.row.addEventListener(Params.eventStart, (e: Event) => {
        const resetTarget = e.target as HTMLElement | null
        if (resetTarget?.closest('.cb-param-reset')) return
        preventDefault(e)
        e.stopPropagation()
        const next = !draft[entry.key]
        ;(draft as Record<string, unknown>)[key] = next
        ctrl.toggleEl?.classList.toggle('cb-switch--on', next)
        syncConditionalVisibility()
        previewController?.requestLatestRender()
      })
    } else if ((entry.kind === 'segmented' || entry.kind === 'select') && ctrl.row) {
      for (const [optVal, btnEl] of Object.entries(ctrl.optionButtons)) {
        btnEl.addEventListener(Params.eventStart, (e: Event) => {
          preventDefault(e)
          e.stopPropagation()
          ;(draft as Record<string, unknown>)[key] = optVal === '' ? undefined : optVal
          for (const [k, b] of Object.entries(ctrl.optionButtons)) {
            b.classList.toggle('cb-segmented__btn--active', k === optVal)
          }
          syncConditionalVisibility()
          previewController?.requestLatestRender()
        })
      }
    }

    ctrl.resetBtn?.addEventListener(Params.eventStart, (e: Event) => {
      preventDefault(e)
      e.stopPropagation()
      const fallback = paramDefaults[entry.key]
      if (entry.kind === 'slider') {
        const val = clampAndRoundSchemaValue(entry, typeof fallback === 'number' ? fallback : 0)
        ;(draft as Record<string, unknown>)[key] = val
        setSliderVisual(entry, ctrl.slider, ctrl.cursor, ctrl.valueLabel, val)
        enforceMinMaxCoherence(entry.key)
      } else if (entry.kind === 'toggle') {
        const next = Boolean(fallback)
        ;(draft as Record<string, unknown>)[key] = next
        ctrl.toggleEl?.classList.toggle('cb-switch--on', next)
        syncConditionalVisibility()
      } else {
        const optVal = fallback === undefined || fallback === null ? '' : String(fallback)
        ;(draft as Record<string, unknown>)[key] = optVal === '' ? undefined : fallback
        for (const [k, b] of Object.entries(ctrl.optionButtons)) {
          b.classList.toggle('cb-segmented__btn--active', k === optVal)
        }
        syncConditionalVisibility()
      }
      previewController?.requestLatestRender()
    })
  }

  for (const [secId, headerEl] of Object.entries(refs.sectionToggleHeaders)) {
    headerEl.addEventListener(Params.eventStart, (e: Event) => {
      preventDefault(e)
      e.stopPropagation()
      const body = refs.sectionBodies[secId]
      const container = refs.sectionContainers[secId]
      if (body) {
        const isHidden = body.classList.toggle('displayNone')
        container?.classList.toggle('cb-section--expanded', !isHidden)
      }
    })
  }

  const applyBase64Frame = async (
    base64: string,
    optionId: 'image' | 'customDraw',
    immediateCanvas?: HTMLCanvasElement
  ) => {
    draft.frameType = TOOL_FRAME_IMAGE
    draft.frameImageBase64 = base64
    activeFrameOptionId = optionId
    draftImageRevision++

    if (immediateCanvas) {
      draftImageElement = limitStampSourceSize(immediateCanvas)
    }
    if (base64 && typeof Image !== 'undefined') {
      try {
        const img = await getImageFromUrl(base64)
        if (img && (img.naturalWidth > 0 || img.width > 0)) {
          draftImageElement = limitStampSourceSize(img)
        }
      } catch {
        // Keep immediateCanvas fallback if available
      }
    }
    syncFrameTilesAndImageBar()
    syncConditionalVisibility()
    previewController?.requestLatestRender()
  }

  refs.fileInput?.addEventListener('change', () => {
    const file = refs.fileInput?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (result) {
        await applyBase64Frame(result, 'image')
      }
    }
    reader.readAsDataURL(file)
    if (refs.fileInput) {
      refs.fileInput.value = ''
    }
  })

  for (const opt of CUSTOM_BRUSH_FRAME_OPTIONS) {
    const btn = refs.frameButtons[opt.id]
    if (!btn) continue
    btn.addEventListener(Params.eventStart, (e: Event) => {
      preventDefault(e)
      e.stopPropagation()
      if (opt.isCustomDraw) {
        activeFrameOptionId = 'customDraw'
        draft.frameType = TOOL_FRAME_IMAGE
        syncFrameTilesAndImageBar()
        syncConditionalVisibility()
        void frameEditorController?.open(draft.frameImageBase64)
        return
      }
      if (opt.isImageUpload) {
        activeFrameOptionId = 'image'
        draft.frameType = TOOL_FRAME_IMAGE
        syncFrameTilesAndImageBar()
        syncConditionalVisibility()
        if (!draft.frameImageBase64) {
          refs.fileInput?.click()
        } else {
          previewController?.requestLatestRender()
        }
        return
      }
      activeFrameOptionId = opt.id
      draft.frameType = opt.frameType
      delete draft.frameImageBase64
      draftImageElement = null
      draftImageRevision++
      syncFrameTilesAndImageBar()
      syncConditionalVisibility()
      previewController?.requestLatestRender()
    })
  }

  refs.reuploadImageBtn?.addEventListener(Params.eventStart, (e: Event) => {
    preventDefault(e)
    e.stopPropagation()
    refs.fileInput?.click()
  })

  refs.redrawFrameBtn?.addEventListener(Params.eventStart, (e: Event) => {
    preventDefault(e)
    e.stopPropagation()
    void frameEditorController?.open(draft.frameImageBase64)
  })

  refs.resetPreviewBtn?.addEventListener(Params.eventStart, (e: Event) => {
    preventDefault(e)
    e.stopPropagation()
    previewController?.resetToDefaultSamples()
  })

  frameEditorController = createCustomFrameEditorController(
    refs.frameEditor,
    (base64, sourceCanvas) => {
      void applyBase64Frame(base64, 'customDraw', sourceCanvas)
    }
  )

  const cleanupAndClose = async () => {
    previewController?.destroy()
    frameEditorController?.destroy()
    previewController = null
    frameEditorController = null
    await Messages.panel(modalRoot)
  }

  refs.cancelBtn?.addEventListener(Params.eventStart, (e: Event) => {
    preventDefault(e)
    e.stopPropagation()
    void cleanupAndClose()
  })

  refs.saveBtn?.addEventListener(Params.eventStart, async (e: Event) => {
    preventDefault(e)
    e.stopPropagation()
    if (mode === 'edit' && brushId) {
      const updated = await updateCustomBrush(brushId, draft)
      if (updated && draftImageElement && draft.frameType === TOOL_FRAME_IMAGE) {
        setHydratedCustomBrushImage(updated.brush.id, draftImageElement)
      }
      await cleanupAndClose()
      if (updated) {
        onSaved?.(updated.index)
      }
    } else {
      const created = await addCustomBrush(draft)
      if (draftImageElement && draft.frameType === TOOL_FRAME_IMAGE) {
        setHydratedCustomBrushImage(created.brush.id, draftImageElement)
      }
      await cleanupAndClose()
      onSaved?.(created.index)
    }
  })

  refs.deleteBtn?.addEventListener(Params.eventStart, async (e: Event) => {
    preventDefault(e)
    e.stopPropagation()
    if (mode !== 'edit' || !brushId) return
    const confirmed = await Messages.confirm('Delete this custom brush?', true)
    if (!confirmed) return
    const { nextIndex } = await removeCustomBrush(brushId)
    await cleanupAndClose()
    onDeleted?.(nextIndex)
  })

  syncFrameTilesAndImageBar()
  syncConditionalVisibility()

  await Messages.panel(modalRoot, {
    mandatory: true,
    force: true,
    onClose: () => {
      previewController?.destroy()
      frameEditorController?.destroy()
      modalRoot.parentElement?.classList.remove('messages__panel-custom-brush')
    },
  })

  if (modalRoot.parentElement) {
    modalRoot.parentElement.classList.add('messages__panel-custom-brush')
  }

  if (refs.previewCanvas) {
    const logicalPx = Math.max(240, PREVIEW_CANVAS_LOGICAL_REM * (spacing.ONE_REM || 10))
    previewController = createCustomBrushPreviewController(
      refs.previewCanvas,
      logicalPx,
      buildPreviewToolProps
    )
    requestAnimationFrame(() => {
      for (const entry of CUSTOM_BRUSH_PARAM_SCHEMA) {
        if (entry.kind === 'slider') {
          syncSingleSlider(entry.key)
        }
      }
      previewController?.renderNow()
    })
  }
}
