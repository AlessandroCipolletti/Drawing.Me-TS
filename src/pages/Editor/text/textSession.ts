import Params from 'main/Params'
import * as Coworking from 'modules/Coworking'
import { preventDefault } from 'utils/domUtils'
import { getNumberInBetween, round } from 'utils/mathUtils'
import { addHorizontalDragSliderHandler } from 'utils/uiUtils'
import * as Layers from '../components/Layers'
import {
  compositeSourceToDisplay,
  getClipMaskCanvas,
  getLayerDomCanvas,
  refreshMaskDependents,
  syncLayerDisplay,
} from '../components/Layers/layerMask'
import { state as layersState } from '../components/Layers/layersState'
import * as Tools from '../components/Tools'
import type { EditorRefs } from '../EditorView'
import type { EditorState, PointerTouchEvent, TextBarSliderKey } from '../editorTypes'
import {
  applyFloatingBarScreenPosition,
  clampFloatingBarCenter,
  tryApplyFloatingBarManualPosition,
} from '../floatingFeatureBarLayout'
import { syncGradientSwatchDom } from '../gradientFill'
import { ensureTextFontLoaded, findTextFontEntry } from './textFonts'
import { fitAutoTextBoxWidth, layoutTextSpec } from './textLayout'
import { hitTestTextBoxHandle, paintTextSpecOnContext, renderTextEditOverlay } from './textRaster'
import {
  cloneTextSpec,
  createDefaultTextSpec,
  deriveLayerNameFromText,
  hitTestTextBox,
  MAX_TEXT_FONT_SIZE,
  MIN_TEXT_BOX_WIDTH,
  MIN_TEXT_FONT_SIZE,
  normalizeTextHex,
  TEXT_ALIGNS,
  type TextSpec,
} from './textSpec'

const TEXT_SLIDER_KEYS: readonly TextBarSliderKey[] = [
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'strokeWidth',
  'shadowBlur',
]

const clearTextOverlay = (overlayCanvas: HTMLCanvasElement | null) => {
  if (!overlayCanvas) return
  const ctx = overlayCanvas.getContext('2d')
  ctx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
  overlayCanvas.classList.add('displayNone')
}

const placeTextBarInsideScreen = (barEl: HTMLElement, left: number, top: number) => {
  const screenMargin = 8
  barEl.style.maxWidth = `${Math.max(240, Params.width - screenMargin * 2)}px`
  const barW = barEl.getBoundingClientRect().width || 320
  const minCenter = barW / 2 + screenMargin
  const maxCenter = Math.max(minCenter, Params.width - barW / 2 - screenMargin)
  applyFloatingBarScreenPosition(barEl, getNumberInBetween(minCenter, maxCenter, left, 0), top)
}

export const updateTextBarPosition = (state: EditorState, refs: EditorRefs) => {
  if (!refs.textBar || !state.textMode?.active) return
  const defaultLeft =
    state.canvas.offset.left +
    (Params.width - state.canvas.offset.left - state.canvas.offset.right) / 2
  const defaultTop = Math.max(state.canvas.offset.top + 14, 18)
  if (tryApplyFloatingBarManualPosition('text', refs.textBar)) {
    const left = parseFloat(refs.textBar.style.left)
    const top = parseFloat(refs.textBar.style.top)
    placeTextBarInsideScreen(
      refs.textBar,
      Number.isFinite(left) ? left : defaultLeft,
      Number.isFinite(top) ? top : defaultTop
    )
    return
  }
  const clamped = clampFloatingBarCenter(refs.textBar, defaultLeft, defaultTop, state.canvas.offset)
  placeTextBarInsideScreen(refs.textBar, clamped.left, clamped.top)
}

const specValueToSliderPct = (key: TextBarSliderKey, spec: TextSpec): number => {
  if (key === 'fontSize') {
    return round(
      ((spec.fontSize - MIN_TEXT_FONT_SIZE) / (MAX_TEXT_FONT_SIZE - MIN_TEXT_FONT_SIZE)) * 100,
      0
    )
  }
  if (key === 'lineHeight') {
    return round(((spec.lineHeight - 0.8) / (3 - 0.8)) * 100, 0)
  }
  if (key === 'letterSpacing') {
    return round(((spec.letterSpacing + 10) / 70) * 100, 0)
  }
  if (key === 'strokeWidth') {
    return round((spec.strokeWidth / 28) * 100, 0)
  }
  return round((spec.shadowBlur / 48) * 100, 0)
}

const applySliderPctToSpec = (key: TextBarSliderKey, pct: number, spec: TextSpec) => {
  const t = getNumberInBetween(0, 100, pct, 2) / 100
  if (key === 'fontSize') {
    spec.fontSize = round(MIN_TEXT_FONT_SIZE + t * (MAX_TEXT_FONT_SIZE - MIN_TEXT_FONT_SIZE), 0)
  } else if (key === 'lineHeight') {
    spec.lineHeight = round(0.8 + t * (3 - 0.8), 2)
  } else if (key === 'letterSpacing') {
    spec.letterSpacing = round(-10 + t * 70, 1)
  } else if (key === 'strokeWidth') {
    spec.strokeWidth = round(t * 28, 1)
  } else if (key === 'shadowBlur') {
    spec.shadowBlur = round(t * 48, 0)
  }
}

const paintSlider = (refs: EditorRefs, key: TextBarSliderKey, spec: TextSpec) => {
  const slider = refs.textSliders?.[key]
  if (!slider?.track || !slider.cursor) return
  const pct = getNumberInBetween(0, 100, specValueToSliderPct(key, spec), 0)
  slider.cursor.style.left = `${pct}%`
  slider.track.style.backgroundImage = `linear-gradient(90deg, var(--palette-gray-1) ${pct}%, var(--palette-gray-6) ${pct}%)`
}

const specHasShadow = (spec: TextSpec) =>
  spec.shadowBlur > 0 || spec.shadowOffsetX !== 0 || spec.shadowOffsetY !== 0

const syncTextBarUi = (state: EditorState, refs: EditorRefs) => {
  if (!state.textMode) return
  const spec = state.textMode.draftSpec || createDefaultTextSpec()

  if (refs.textFontSelect && refs.textFontSelect.value !== spec.fontFamily) {
    refs.textFontSelect.value = spec.fontFamily
  }
  if (refs.textFontSelect) {
    refs.textFontSelect.style.fontFamily = `"${spec.fontFamily}", Poppins, sans-serif`
  }

  refs.textWeightButton?.classList.toggle('selected', spec.fontWeight >= 600)
  refs.textItalicButton?.classList.toggle('selected', spec.italic)
  refs.textUnderlineButton?.classList.toggle('selected', spec.underline)
  refs.textStrikeButton?.classList.toggle('selected', spec.strike)
  refs.textOutlineButton?.classList.toggle('selected', state.textMode.outlineOpen)
  refs.textShadowButton?.classList.toggle('selected', state.textMode.shadowOpen)

  const alignLabel = refs.textAlignButton?.querySelector('.editor-lasso__action-label')
  if (alignLabel) {
    alignLabel.textContent =
      spec.align === 'center' ? 'Center' : spec.align === 'right' ? 'Right' : 'Left'
  }

  syncGradientSwatchDom(refs.textFillSwatch, spec.color)
  syncGradientSwatchDom(refs.textStrokeSwatch, spec.strokeColor)
  syncGradientSwatchDom(refs.textShadowSwatch, spec.shadowColor)
  if (refs.textFillColorInput) refs.textFillColorInput.value = spec.color
  if (refs.textStrokeColorInput) refs.textStrokeColorInput.value = spec.strokeColor
  if (refs.textShadowColorInput) refs.textShadowColorInput.value = spec.shadowColor
  refs.textStrokeSwatch?.classList.toggle('displayNone', !state.textMode.outlineOpen)
  refs.textShadowSwatch?.classList.toggle('displayNone', !state.textMode.shadowOpen)
  refs.textSliders?.strokeWidth?.cell?.classList.toggle('displayNone', !state.textMode.outlineOpen)
  refs.textSliders?.shadowBlur?.cell?.classList.toggle('displayNone', !state.textMode.shadowOpen)

  for (const key of TEXT_SLIDER_KEYS) {
    paintSlider(refs, key, spec)
  }
}

export const showTextBar = (state: EditorState, refs: EditorRefs) => {
  if (!state.textMode) return
  state.textMode.active = true
  syncTextBarUi(state, refs)
  refs.textBar?.classList.remove('displayNone')
  refs.textBar?.classList.remove('editor-lasso__bar--drawing')
  updateTextBarPosition(state, refs)
}

export const hideTextBar = (state: EditorState, refs: EditorRefs) => {
  if (state.textMode) {
    state.textMode.active = false
    state.textMode.isDraggingBox = false
    state.textMode.draggingHandle = null
  }
  refs.textBar?.classList.remove('editor-lasso__bar--drawing')
  refs.textBar?.classList.add('displayNone')
  refs.textInput?.blur()
  refs.textInput?.classList.add('displayNone')
  clearTextOverlay(refs.textOverlay)
}

const setLayerDomHiddenWhileEditing = (layerId: string, hidden: boolean) => {
  const layer = layersState.layers[layerId]
  if (!layer) return
  const domCanvas = getLayerDomCanvas(layer)
  if (domCanvas) {
    domCanvas.style.visibility = hidden ? 'hidden' : ''
  }
}

const repaintActiveTextPreview = (state: EditorState, refs: EditorRefs) => {
  if (!state.textMode?.hasActiveSession || !state.textMode.draftSpec) {
    clearTextOverlay(refs.textOverlay)
    return
  }
  if (!state.textMode.isDraggingBox) {
    fitAutoTextBoxWidth(
      state.textMode.draftSpec,
      state.canvas.width,
      refs.textOverlay?.getContext('2d')
    )
  }
  renderTextEditOverlay(
    refs.textOverlay,
    state.textMode.draftSpec,
    state.canvas.scale,
    getClipMaskCanvas(state.textMode.layerId)
  )
}

const focusTextInput = (refs: EditorRefs, text: string) => {
  const input = refs.textInput
  if (!input) return
  input.classList.remove('displayNone')
  input.value = text
  try {
    input.focus({ preventScroll: true })
    input.setSelectionRange(text.length, text.length)
  } catch {
    // Ignore focus failures in headless test environments
  }
}

const hitTestTopmostTextLayer = (px: number, py: number): string | null => {
  const candidates = Object.values(layersState.layers)
    .filter(
      (layer) =>
        layer.active &&
        layer.opacity > 0 &&
        Boolean(layer.textSpec) &&
        layer.owner === Coworking.getUserId()
    )
    .sort((a, b) => b.order - a.order)

  for (const layer of candidates) {
    const spec = layer.textSpec!
    const layout = layoutTextSpec(spec, layer.canvas?.context)
    if (hitTestTextBox(px, py, layout.boxBounds, 10)) {
      return layer.id
    }
  }
  return null
}

const rasterizeTextSpecToLayer = async (
  layerId: string,
  spec: TextSpec,
  options?: { recordHistory?: boolean; syncCoworking?: boolean; renameLayerFromText?: boolean }
): Promise<boolean> => {
  const layer = layersState.layers[layerId]
  if (!layer?.canvas?.context) return false

  await ensureTextFontLoaded(spec.fontFamily)
  const cloned = cloneTextSpec(spec)
  if (!cloned) return false

  layer.textSpec = cloned
  paintTextSpecOnContext(layer.canvas.context, cloned, { clearTarget: true })

  if (options?.renameLayerFromText) {
    const derivedName = deriveLayerNameFromText(cloned.text, layer.name)
    Layers.saveLayerNameDirect(layerId, derivedName)
  }

  if (layer.maskBelowLayerId) {
    compositeSourceToDisplay(layerId)
  } else {
    syncLayerDisplay(layerId)
  }
  refreshMaskDependents(layerId)

  if (options?.recordHistory !== false) {
    await Layers.addLayerHistoryContentChangedStep(layerId)
  } else {
    await Layers.updateLayerBoundsAndPreview(layerId)
  }

  if (options?.syncCoworking && Coworking.isOpen()) {
    Coworking.sendTextLayerUpdate(layerId, cloned, layer.name)
  }
  return true
}

export const openTextEditSessionForLayer = async (
  state: EditorState,
  refs: EditorRefs,
  layerId: string,
  createdNewLayer = false,
  initialSpec?: TextSpec
) => {
  const layer = layersState.layers[layerId]
  if (!layer) return

  if (state.textMode.hasActiveSession && state.textMode.layerId !== layerId) {
    await commitActiveTextSession(state, refs)
  }

  if (Layers.getCurrentSelectedLayerId() !== layerId) {
    await Layers.selectLayerById(layerId)
  }

  const baseSpec =
    cloneTextSpec(initialSpec || layer.textSpec) ||
    createDefaultTextSpec({
      x: Math.round(state.canvas.width * 0.3),
      y: Math.round(state.canvas.height * 0.4),
      width: Math.round(state.canvas.width * 0.4),
    })

  await ensureTextFontLoaded(baseSpec.fontFamily)

  state.textMode.hasActiveSession = true
  state.textMode.outlineOpen = baseSpec.strokeWidth > 0
  state.textMode.shadowOpen = specHasShadow(baseSpec)
  state.textMode.createdNewLayer = createdNewLayer
  state.textMode.layerId = layerId
  state.textMode.committedSpec = layer.textSpec ? cloneTextSpec(layer.textSpec) || null : null
  state.textMode.draftSpec = baseSpec
  state.textMode.isDraggingBox = false
  state.textMode.draggingHandle = null

  setLayerDomHiddenWhileEditing(layerId, true)
  showTextBar(state, refs)
  repaintActiveTextPreview(state, refs)
  focusTextInput(refs, baseSpec.text)
}

const commitActiveTextSession = async (state: EditorState, refs: EditorRefs): Promise<boolean> => {
  if (!state.textMode?.hasActiveSession || !state.textMode.layerId) {
    clearTextOverlay(refs.textOverlay)
    return false
  }

  const layerId = state.textMode.layerId
  const draft = state.textMode.draftSpec
  const createdNew = state.textMode.createdNewLayer

  setLayerDomHiddenWhileEditing(layerId, false)

  state.textMode.hasActiveSession = false
  state.textMode.outlineOpen = false
  state.textMode.shadowOpen = false
  state.textMode.createdNewLayer = false
  state.textMode.layerId = ''
  state.textMode.draftSpec = null
  state.textMode.committedSpec = null
  state.textMode.isDraggingBox = false
  state.textMode.draggingHandle = null
  refs.textInput?.blur()
  refs.textInput?.classList.add('displayNone')
  clearTextOverlay(refs.textOverlay)

  if (!draft || !draft.text.trim()) {
    if (createdNew) {
      await Layers.deleteEmptyTransientLayer(layerId)
    } else if (draft) {
      await rasterizeTextSpecToLayer(
        layerId,
        { ...draft, text: '' },
        {
          recordHistory: true,
          syncCoworking: true,
        }
      )
    } else {
      syncLayerDisplay(layerId)
    }
    syncTextBarUi(state, refs)
    return false
  }

  await rasterizeTextSpecToLayer(layerId, draft, {
    recordHistory: true,
    syncCoworking: true,
    renameLayerFromText: true,
  })
  syncTextBarUi(state, refs)
  return true
}

export const cancelActiveTextSession = async (state: EditorState, refs: EditorRefs) => {
  if (!state.textMode?.hasActiveSession) {
    clearTextOverlay(refs.textOverlay)
    return
  }
  const layerId = state.textMode.layerId
  const createdNew = state.textMode.createdNewLayer
  const committed = state.textMode.committedSpec

  setLayerDomHiddenWhileEditing(layerId, false)

  state.textMode.hasActiveSession = false
  state.textMode.outlineOpen = false
  state.textMode.shadowOpen = false
  state.textMode.createdNewLayer = false
  state.textMode.layerId = ''
  state.textMode.draftSpec = null
  state.textMode.committedSpec = null
  state.textMode.isDraggingBox = false
  state.textMode.draggingHandle = null
  refs.textInput?.blur()
  refs.textInput?.classList.add('displayNone')
  clearTextOverlay(refs.textOverlay)

  if (createdNew && !committed) {
    await Layers.deleteEmptyTransientLayer(layerId)
  } else if (layerId && layersState.layers[layerId]) {
    layersState.layers[layerId].textSpec = committed ? cloneTextSpec(committed) : undefined
    syncLayerDisplay(layerId)
  }
  syncTextBarUi(state, refs)
}

export const startOrManipulateTextAtPoint = async (
  state: EditorState,
  refs: EditorRefs,
  x: number,
  y: number
) => {
  if (state.textMode.hasActiveSession && state.textMode.draftSpec) {
    const layout = layoutTextSpec(state.textMode.draftSpec, refs.textOverlay?.getContext('2d'))
    const handle = hitTestTextBoxHandle(x, y, layout.boxBounds, state.canvas.scale)
    if (handle) {
      state.textMode.isDraggingBox = true
      state.textMode.draggingHandle = handle
      state.textMode.dragStartX = x
      state.textMode.dragStartY = y
      state.textMode.dragInitialSpec = cloneTextSpec(state.textMode.draftSpec) || null
      refs.textBar?.classList.add('editor-lasso__bar--drawing')
      focusTextInput(refs, state.textMode.draftSpec.text)
      return
    }
    if (hitTestTextBox(x, y, layout.boxBounds, 12)) {
      focusTextInput(refs, state.textMode.draftSpec.text)
    }
    return
  }

  const hitLayerId = hitTestTopmostTextLayer(x, y)
  if (hitLayerId) {
    await openTextEditSessionForLayer(state, refs, hitLayerId, false)
    return
  }

  const createdLayerId = await Layers.createNewTextLayer()
  if (!createdLayerId) return

  const defaultWidth = Math.max(MIN_TEXT_BOX_WIDTH, Math.round(state.canvas.width * 0.4))
  const clampedX = getNumberInBetween(
    16,
    Math.max(16, state.canvas.width - defaultWidth - 16),
    Math.round(x),
    0
  )
  const clampedY = getNumberInBetween(16, Math.max(16, state.canvas.height - 96), Math.round(y), 0)
  const spec = createDefaultTextSpec({
    x: clampedX,
    y: clampedY,
    width: defaultWidth,
  })
  await openTextEditSessionForLayer(state, refs, createdLayerId, true, spec)
}

export const moveTextBoxHandleDrag = (
  state: EditorState,
  refs: EditorRefs,
  x: number,
  y: number
) => {
  if (
    !state.textMode.isDraggingBox ||
    !state.textMode.draftSpec ||
    !state.textMode.dragInitialSpec
  ) {
    return
  }
  const init = state.textMode.dragInitialSpec
  const draft = state.textMode.draftSpec
  const dx = x - state.textMode.dragStartX
  const dy = y - state.textMode.dragStartY
  const handle = state.textMode.draggingHandle

  if (handle === 'move') {
    draft.x = round(init.x + dx, 1)
    draft.y = round(init.y + dy, 1)
  } else if (handle === 'widthRight') {
    const cos = Math.cos(-(init.rotation || 0))
    const sin = Math.sin(-(init.rotation || 0))
    const localDx = dx * cos - dy * sin
    draft.widthLocked = true
    draft.width = Math.max(MIN_TEXT_BOX_WIDTH, round(init.width + localDx, 1))
  } else if (handle === 'widthLeft') {
    const cos = Math.cos(-(init.rotation || 0))
    const sin = Math.sin(-(init.rotation || 0))
    const localDx = dx * cos - dy * sin
    const nextW = Math.max(MIN_TEXT_BOX_WIDTH, round(init.width - localDx, 1))
    const appliedDelta = init.width - nextW
    draft.widthLocked = true
    draft.width = nextW
    draft.x = round(init.x + appliedDelta * Math.cos(init.rotation || 0), 1)
    draft.y = round(init.y + appliedDelta * Math.sin(init.rotation || 0), 1)
  } else if (handle === 'rotate') {
    const layout = layoutTextSpec(init, refs.textOverlay?.getContext('2d'))
    const angle = Math.atan2(y - layout.boxBounds.cy, x - layout.boxBounds.cx) + Math.PI / 2
    draft.rotation = round(angle, 4)
  }

  repaintActiveTextPreview(state, refs)
}

export const endTextBoxHandleDrag = (state: EditorState, refs: EditorRefs) => {
  if (!state.textMode.isDraggingBox) return
  state.textMode.isDraggingBox = false
  state.textMode.draggingHandle = null
  state.textMode.dragInitialSpec = null
  refs.textBar?.classList.remove('editor-lasso__bar--drawing')
  if (state.textMode.draftSpec) {
    focusTextInput(refs, state.textMode.draftSpec.text)
  }
  repaintActiveTextPreview(state, refs)
}

export const bindTextBarEvents = (
  state: EditorState,
  refs: EditorRefs,
  _touchEvent?: PointerTouchEvent
) => {
  refs.textBar?.addEventListener(Params.eventStart, (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
    if (tag !== 'input' && tag !== 'select' && tag !== 'option') {
      preventDefault(e)
    }
  })

  const applyFontFamily = (family: string) => {
    const spec = state.textMode.draftSpec
    if (!spec) return
    spec.fontFamily = family
    const entry = findTextFontEntry(family)
    if (entry && !entry.weights.includes(spec.fontWeight)) {
      const boldWeight = entry.weights.find((weight) => weight >= 600)
      spec.fontWeight =
        spec.fontWeight >= 600 && boldWeight
          ? boldWeight
          : entry.weights.includes(400)
            ? 400
            : entry.weights[0] || 400
    }
    if (entry && !entry.italic) {
      spec.italic = false
    }
    syncTextBarUi(state, refs)
    void ensureTextFontLoaded(family).then(() => {
      syncTextBarUi(state, refs)
      repaintActiveTextPreview(state, refs)
    })
  }

  refs.textFontSelect?.addEventListener('change', () => {
    const family = refs.textFontSelect?.value
    if (!family) return
    applyFontFamily(family)
  })

  refs.textWeightButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    const spec = state.textMode.draftSpec
    if (!spec) return
    spec.fontWeight = spec.fontWeight >= 600 ? 400 : 700
    syncTextBarUi(state, refs)
    repaintActiveTextPreview(state, refs)
  })

  refs.textItalicButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    const spec = state.textMode.draftSpec
    if (!spec) return
    spec.italic = !spec.italic
    syncTextBarUi(state, refs)
    repaintActiveTextPreview(state, refs)
  })

  refs.textUnderlineButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    const spec = state.textMode.draftSpec
    if (!spec) return
    spec.underline = !spec.underline
    syncTextBarUi(state, refs)
    repaintActiveTextPreview(state, refs)
  })

  refs.textStrikeButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    const spec = state.textMode.draftSpec
    if (!spec) return
    spec.strike = !spec.strike
    syncTextBarUi(state, refs)
    repaintActiveTextPreview(state, refs)
  })

  refs.textAlignButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    const spec = state.textMode.draftSpec
    if (!spec) return
    const idx = TEXT_ALIGNS.indexOf(spec.align)
    spec.align = TEXT_ALIGNS[(idx + 1) % TEXT_ALIGNS.length]
    syncTextBarUi(state, refs)
    repaintActiveTextPreview(state, refs)
  })

  refs.textOutlineButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    const spec = state.textMode.draftSpec
    if (!spec) return
    state.textMode.outlineOpen = !state.textMode.outlineOpen
    if (state.textMode.outlineOpen) {
      if (spec.strokeWidth <= 0) spec.strokeWidth = 4
      if (spec.strokeColor.toLowerCase() === spec.color.toLowerCase()) {
        spec.strokeColor = spec.color.toLowerCase() === '#ffffff' ? '#111111' : '#ffffff'
      }
    } else {
      spec.strokeWidth = 0
    }
    syncTextBarUi(state, refs)
    repaintActiveTextPreview(state, refs)
    updateTextBarPosition(state, refs)
  })

  refs.textShadowButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    const spec = state.textMode.draftSpec
    if (!spec) return
    state.textMode.shadowOpen = !state.textMode.shadowOpen
    if (state.textMode.shadowOpen) {
      if (!specHasShadow(spec)) {
        spec.shadowBlur = 12
        spec.shadowOffsetY = 6
        spec.shadowColor = '#000000'
      }
    } else {
      spec.shadowBlur = 0
      spec.shadowOffsetX = 0
      spec.shadowOffsetY = 0
    }
    syncTextBarUi(state, refs)
    repaintActiveTextPreview(state, refs)
    updateTextBarPosition(state, refs)
  })

  const onColorInput = (targetField: 'color' | 'strokeColor' | 'shadowColor', e: Event) => {
    const input = e.target as HTMLInputElement | null
    const hex = normalizeTextHex(input?.value)
    if (!state.textMode.draftSpec) return
    state.textMode.draftSpec[targetField] = hex
    syncTextBarUi(state, refs)
    repaintActiveTextPreview(state, refs)
  }

  refs.textFillColorInput?.addEventListener('input', (e) => onColorInput('color', e))
  refs.textFillColorInput?.addEventListener('change', (e) => onColorInput('color', e))
  refs.textStrokeColorInput?.addEventListener('input', (e) => onColorInput('strokeColor', e))
  refs.textStrokeColorInput?.addEventListener('change', (e) => onColorInput('strokeColor', e))
  refs.textShadowColorInput?.addEventListener('input', (e) => onColorInput('shadowColor', e))
  refs.textShadowColorInput?.addEventListener('change', (e) => onColorInput('shadowColor', e))

  for (const key of TEXT_SLIDER_KEYS) {
    const slider = refs.textSliders?.[key]
    if (!slider?.track || !slider.cursor || slider.cursor.dataset.bound === '1') continue
    slider.cursor.dataset.bound = '1'
    addHorizontalDragSliderHandler(
      slider.cursor,
      slider.track,
      (val: number) => {
        const spec = state.textMode.draftSpec
        if (!spec) return
        applySliderPctToSpec(key, val, spec)
        syncTextBarUi(state, refs)
        repaintActiveTextPreview(state, refs)
      },
      100,
      0,
      false,
      0
    )
  }

  refs.textInput?.addEventListener('input', () => {
    if (!state.textMode.draftSpec || !refs.textInput) return
    state.textMode.draftSpec.text = refs.textInput.value
    repaintActiveTextPreview(state, refs)
  })

  refs.textInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      void cancelActiveTextSession(state, refs)
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void commitActiveTextSession(state, refs)
    }
  })

  refs.textDoneButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    void commitActiveTextSession(state, refs)
  })

  refs.textCancelButton?.addEventListener(Params.eventStart, (e) => {
    preventDefault(e)
    void cancelActiveTextSession(state, refs).then(() => {
      if (!state.textMode.hasActiveSession) {
        Tools.selectLastUsedTool(false)
      }
    })
  })
}
