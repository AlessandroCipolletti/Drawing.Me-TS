import { v4 as uuidv4 } from 'uuid'
import Params from 'main/Params'
import { toolDefaultProps, ToolConfigProps, ToolCustomPropsMap } from 'pages/Editor/config'
import { TOOL_FRAME_CIRCLE, TOOL_FRAME_IMAGE } from 'pages/Editor/constants'
import { normalizeToolDrawParams, sanitizeToolCustomProps } from 'utils/canvasUtils'
import { getImageFromUrl, resizeImage } from 'utils/imageUtils'
import { deepCopy } from 'utils/jsUtils'
import { getCustomBrushesAppData, saveCustomBrushesAppData } from 'utils/localDbUtils'
import { logarithmicPercToValue } from 'utils/mathUtils'
import type { CustomBrushDraftProps, CustomBrushPersisted } from './customBrushTypes'

const FORBIDDEN_PERSISTED_KEYS = new Set([
  'name',
  'versions',
  'frameImageFile',
  'frameImageName',
  'color',
  'customProps',
  'globalCompositeOperation',
  'cursor',
  'hasSizeAndAlpha',
  'showVersionPreview',
  'stepsToUpdateCoworking',
  '__proto__',
  'constructor',
  'prototype',
])

let brushesState: CustomBrushPersisted[] = []
let selectedBrushIdState: string | false = false
const customBrushImageCache = new Map<string, HTMLImageElement | HTMLCanvasElement>()
const warnedIds = new Set<string>()

let customStorageAdapter: {
  load: () => Promise<{
    customBrushes: CustomBrushPersisted[]
    selectedCustomBrushId: string | false
  }>
  save: (payload: {
    customBrushes?: CustomBrushPersisted[]
    selectedCustomBrushId?: string | false
  }) => Promise<unknown>
} | null = null

export const setCustomBrushStorageAdapter = (adapter: typeof customStorageAdapter) => {
  customStorageAdapter = adapter
}

export const isCustomBrushSupported = (): boolean => !Params.isPhone

export const getDefaultCustomBrushDraft = (): CustomBrushDraftProps => {
  const minSize = 2
  const maxSize = 400
  const minAlpha = 0.003
  const maxAlpha = 0.24
  const base: Record<string, unknown> = {
    ...toolDefaultProps,
    frameType: TOOL_FRAME_CIRCLE,
    minSize,
    maxSize,
    size: logarithmicPercToValue(50, minSize, maxSize, 1),
    sizeForceFactor: 0.3,
    sizeSpeedFactor: -0.08,
    sizeAltitudeFactor: 0.35,
    minAlpha,
    maxAlpha,
    alpha: logarithmicPercToValue(50, minAlpha, maxAlpha, 3),
    alphaForceFactor: 0.075,
    alphaSpeedFactor: -0.02,
    forceCurve: 1.2,
    altitudeCurve: 1.35,
    speedCurve: 1,
    useTimeBasedSpeed: true,
    speedSmoothing: 0.4,
    stabilization: 0.25,
    aspectRatio: 1,
    aspectAltitudeFactor: 0.25,
    aspectForceFactor: 0.1,
    handleStylusRotation: true,
    handleStylusTwist: true,
    endTaperFactor: 0.45,
    completeEndSegment: true,
    preserveStampRemainder: true,
    usePredictedEvents: true,
    maxSizeThatNeedsToAdaptLine: 75,
    pxToAdaptLine: 15,
    msToAdaptLine: 10,
    stepsToAdaptLine: 5,
    sizeToFramesRatio: 0.025,
  }
  for (const key of FORBIDDEN_PERSISTED_KEYS) {
    delete base[key]
  }
  return base as CustomBrushDraftProps
}

export const sanitizeCustomBrushDraft = (raw: CustomBrushDraftProps): CustomBrushDraftProps => {
  const merged: Record<string, unknown> = {
    ...getDefaultCustomBrushDraft(),
  }
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (FORBIDDEN_PERSISTED_KEYS.has(k) || v === undefined) continue
      merged[k] = v
    }
  }
  const frameType =
    typeof merged.frameType === 'string' && merged.frameType ? merged.frameType : TOOL_FRAME_CIRCLE
  const frameImageBase64 =
    frameType === TOOL_FRAME_IMAGE && typeof raw?.frameImageBase64 === 'string'
      ? raw.frameImageBase64
      : undefined

  if (frameImageBase64 && frameImageBase64.length > 2 * 1024 * 1024) {
    console.warn('[CustomBrush] Large frameImageBase64 (>2MB):', frameImageBase64.length)
  }

  const normalized = normalizeToolDrawParams({
    ...(merged as Partial<ToolConfigProps>),
    frameType,
    minPxDistanceBetweenFrames:
      typeof merged.minPxDistanceBetweenFrames === 'number' ? merged.minPxDistanceBetweenFrames : 1,
    sizeToFramesRatio:
      typeof merged.sizeToFramesRatio === 'number' ? merged.sizeToFramesRatio : 0.025,
  }) as Record<string, unknown>

  if (typeof normalized.minSize === 'number' && typeof normalized.maxSize === 'number') {
    if (normalized.minSize > normalized.maxSize) {
      normalized.maxSize = normalized.minSize
    }
    const maxS = normalized.maxSize as number
    const minS = normalized.minSize as number
    if (typeof normalized.size === 'number') {
      normalized.size = Math.min(maxS, Math.max(minS, normalized.size))
    }
  }
  if (typeof normalized.minAlpha === 'number' && typeof normalized.maxAlpha === 'number') {
    if (normalized.minAlpha > normalized.maxAlpha) {
      normalized.maxAlpha = normalized.minAlpha
    }
    const maxA = normalized.maxAlpha as number
    const minA = normalized.minAlpha as number
    if (typeof normalized.alpha === 'number') {
      normalized.alpha = Math.min(maxA, Math.max(minA, normalized.alpha))
    }
  }

  for (const key of FORBIDDEN_PERSISTED_KEYS) {
    delete normalized[key]
  }
  if (frameImageBase64) {
    normalized.frameImageBase64 = frameImageBase64
  } else {
    delete normalized.frameImageBase64
  }

  return normalized as CustomBrushDraftProps
}

/** Stamp canvas used while drawing. The stored frame can be larger. */
const CUSTOM_BRUSH_STAMP_MAX_PX = 256

export const limitStampSourceSize = (
  image: HTMLImageElement | HTMLCanvasElement
): HTMLImageElement | HTMLCanvasElement => {
  const width = (image as HTMLImageElement).naturalWidth || image.width || 0
  const height = (image as HTMLImageElement).naturalHeight || image.height || 0
  if (width <= CUSTOM_BRUSH_STAMP_MAX_PX && height <= CUSTOM_BRUSH_STAMP_MAX_PX) return image
  return resizeImage(image, CUSTOM_BRUSH_STAMP_MAX_PX)
}

const hydrateCustomBrushImage = async (
  id: string,
  base64?: string
): Promise<HTMLImageElement | HTMLCanvasElement | null> => {
  if (!base64) {
    customBrushImageCache.delete(id)
    return null
  }
  try {
    if (typeof Image !== 'undefined') {
      const img = await getImageFromUrl(base64)
      if (img && (img.naturalWidth > 0 || img.width > 0 || img.src)) {
        const stamp = limitStampSourceSize(img)
        customBrushImageCache.set(id, stamp)
        return stamp
      }
    }
  } catch (err) {
    if (!warnedIds.has(id)) {
      warnedIds.add(id)
      console.warn(`[CustomBrush] Failed to decode image for brush ${id}`, err)
    }
  }
  return null
}

export const setHydratedCustomBrushImage = (
  id: string,
  image: HTMLImageElement | HTMLCanvasElement | null
) => {
  if (image) {
    customBrushImageCache.set(id, image)
  } else {
    customBrushImageCache.delete(id)
  }
}

export const getHydratedCustomBrushImage = (
  id: string
): HTMLImageElement | HTMLCanvasElement | null => customBrushImageCache.get(id) || null

const loadFromStorage = async () => {
  if (customStorageAdapter) {
    return await customStorageAdapter.load()
  }
  const res = await getCustomBrushesAppData()
  if (!res || typeof res !== 'object') {
    return { customBrushes: [], selectedCustomBrushId: false as const }
  }
  return {
    customBrushes: Array.isArray(res.customBrushes)
      ? (res.customBrushes as CustomBrushPersisted[])
      : [],
    selectedCustomBrushId: res.selectedCustomBrushId || (false as const),
  }
}

const saveToStorage = async (payload: {
  customBrushes?: CustomBrushPersisted[]
  selectedCustomBrushId?: string | false
}) => {
  if (customStorageAdapter) {
    await customStorageAdapter.save(payload)
    return
  }
  await saveCustomBrushesAppData(payload)
}

export const loadCustomBrushes = async (): Promise<CustomBrushPersisted[]> => {
  if (!isCustomBrushSupported()) {
    brushesState = []
    selectedBrushIdState = false
    return []
  }
  const data = await loadFromStorage()
  const rawList = Array.isArray(data?.customBrushes) ? data.customBrushes : []
  brushesState = rawList
    .filter((item) => item && typeof item.id === 'string' && item.props)
    .map((item) => ({
      id: item.id,
      props: sanitizeCustomBrushDraft(item.props),
      customProps: item.customProps ? sanitizeToolCustomProps(item.customProps) : {},
    }))

  const savedSelectedId = data?.selectedCustomBrushId
  if (savedSelectedId && brushesState.some((b) => b.id === savedSelectedId)) {
    selectedBrushIdState = savedSelectedId
  } else {
    selectedBrushIdState = brushesState[0]?.id || false
  }

  await Promise.all(
    brushesState.map((brush) =>
      brush.props.frameType === TOOL_FRAME_IMAGE && brush.props.frameImageBase64
        ? hydrateCustomBrushImage(brush.id, brush.props.frameImageBase64)
        : Promise.resolve(null)
    )
  )

  return getCustomBrushes()
}

const saveCustomBrushes = async (): Promise<void> => {
  if (!isCustomBrushSupported()) return
  await saveToStorage({
    customBrushes: deepCopy(brushesState),
    selectedCustomBrushId: selectedBrushIdState,
  })
}

export const getCustomBrushes = (): CustomBrushPersisted[] => deepCopy(brushesState)

export const getCustomBrushCount = (): number => brushesState.length

export const getCustomBrushAt = (index: number): CustomBrushPersisted | undefined => {
  const b = brushesState[index]
  return b ? deepCopy(b) : undefined
}

export const getCustomBrushById = (id: string): CustomBrushPersisted | undefined => {
  const b = brushesState.find((item) => item.id === id)
  return b ? deepCopy(b) : undefined
}

export const getCustomBrushIndexById = (id: string | false | undefined): number => {
  if (!id) return -1
  return brushesState.findIndex((item) => item.id === id)
}

export const getSelectedCustomBrushId = (): string | false => selectedBrushIdState

export const getSelectedCustomBrushIndex = (): number => {
  const idx = getCustomBrushIndexById(selectedBrushIdState)
  if (idx >= 0) return idx
  return brushesState.length > 0 ? 0 : -1
}

const setSelectedCustomBrushId = async (id: string | false): Promise<void> => {
  if (id && brushesState.some((b) => b.id === id)) {
    selectedBrushIdState = id
  } else if (!id) {
    selectedBrushIdState = false
  }
  await saveToStorage({ selectedCustomBrushId: selectedBrushIdState })
}

export const setSelectedCustomBrushByIndex = async (index: number): Promise<void> => {
  const brush = brushesState[index]
  if (brush) {
    await setSelectedCustomBrushId(brush.id)
  }
}

export const addCustomBrush = async (
  draft: CustomBrushDraftProps
): Promise<{ brush: CustomBrushPersisted; index: number }> => {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : uuidv4()
  const sanitized = sanitizeCustomBrushDraft(draft)
  const entry: CustomBrushPersisted = {
    id,
    props: sanitized,
    customProps: {},
  }
  if (sanitized.frameType === TOOL_FRAME_IMAGE && sanitized.frameImageBase64) {
    await hydrateCustomBrushImage(id, sanitized.frameImageBase64)
  }
  brushesState.push(entry)
  selectedBrushIdState = id
  await saveCustomBrushes()
  return { brush: deepCopy(entry), index: brushesState.length - 1 }
}

export const updateCustomBrush = async (
  id: string,
  draft: CustomBrushDraftProps
): Promise<{ brush: CustomBrushPersisted; index: number } | null> => {
  const index = brushesState.findIndex((b) => b.id === id)
  if (index < 0) return null
  const sanitized = sanitizeCustomBrushDraft(draft)
  const updated: CustomBrushPersisted = {
    id,
    props: sanitized,
    // Reset size/alpha slider overrides when explicit props are edited in the modal
    customProps: {},
  }
  if (sanitized.frameType === TOOL_FRAME_IMAGE && sanitized.frameImageBase64) {
    await hydrateCustomBrushImage(id, sanitized.frameImageBase64)
  } else {
    customBrushImageCache.delete(id)
  }
  brushesState[index] = updated
  selectedBrushIdState = id
  await saveCustomBrushes()
  return { brush: deepCopy(updated), index }
}

export const removeCustomBrush = async (
  id: string
): Promise<{ remaining: CustomBrushPersisted[]; nextIndex: number | false }> => {
  const index = brushesState.findIndex((b) => b.id === id)
  if (index < 0) {
    return {
      remaining: getCustomBrushes(),
      nextIndex: getSelectedCustomBrushIndex() >= 0 ? getSelectedCustomBrushIndex() : false,
    }
  }
  brushesState.splice(index, 1)
  customBrushImageCache.delete(id)

  let nextIndex: number | false = false
  if (brushesState.length > 0) {
    nextIndex = Math.min(index, brushesState.length - 1)
    selectedBrushIdState = brushesState[nextIndex].id
  } else {
    selectedBrushIdState = false
  }
  await saveCustomBrushes()
  return {
    remaining: getCustomBrushes(),
    nextIndex,
  }
}

export const setCustomBrushCustomProps = async (
  indexOrId: number | string,
  customProps: ToolCustomPropsMap
): Promise<void> => {
  const brush =
    typeof indexOrId === 'number'
      ? brushesState[indexOrId]
      : brushesState.find((b) => b.id === indexOrId)
  if (!brush) return
  brush.customProps = sanitizeToolCustomProps({
    ...(brush.customProps || {}),
    ...customProps,
  })
  await saveCustomBrushes()
}

export const getCustomBrushCustomProps = (indexOrId: number | string): ToolCustomPropsMap => {
  const brush =
    typeof indexOrId === 'number'
      ? brushesState[indexOrId]
      : brushesState.find((b) => b.id === indexOrId)
  return brush?.customProps ? deepCopy(brush.customProps) : {}
}

export const resetCustomBrushStoreForTests = (
  initialBrushes: CustomBrushPersisted[] = [],
  selectedId: string | false = false
) => {
  brushesState = deepCopy(initialBrushes)
  selectedBrushIdState = selectedId
  customBrushImageCache.clear()
}
