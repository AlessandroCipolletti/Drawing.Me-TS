import { round } from 'utils/mathUtils'

export type MagnetismEntry = [number, number | false]

interface MagnetismLayerSlice {
  id: string
  minX: number
  minY: number
  maxX: number
  maxY: number
  active: boolean
  opacity: number
}

interface MagnetismStateSlice {
  currentSelectedLayerId: string | false
  canvases: {
    width: number
    height: number
  }
  layers: Record<string, MagnetismLayerSlice>
}

export const getMagnetismCoordXForLayer = (
  state: MagnetismStateSlice,
  layerId: string | false = state.currentSelectedLayerId,
  hasRotation = false
): MagnetismEntry[] => {
  const layer = state.layers[layerId || '']
  const layerWidth = layer.maxX - layer.minX
  const coords: MagnetismEntry[] = [[round(state.canvases.width / 2, 1), state.canvases.width / 2]]
  if (!hasRotation) {
    coords.push([round(layerWidth / 2, 1), false])
    coords.push([round(state.canvases.width - layerWidth / 2, 1), false])
    coords.push([round(state.canvases.width / 2 + layerWidth / 2, 1), state.canvases.width / 2])
    coords.push([round(state.canvases.width / 2 - layerWidth / 2, 1), state.canvases.width / 2])
  }

  Object.values(state.layers).forEach((l) => {
    if (l.id !== layerId && Number.isFinite(l.minX) && l.active && l.opacity > 0) {
      const lCenterX = round((l.minX + l.maxX) / 2, 1)
      coords.push([lCenterX, lCenterX])
      if (!hasRotation) {
        if (l.minX > 1) {
          coords.push([round(l.minX + layerWidth / 2, 1), l.minX])
          coords.push([round(l.minX - layerWidth / 2, 1), l.minX])
        }
        if (l.maxX < state.canvases.width - 1) {
          coords.push([round(l.maxX + layerWidth / 2, 1), l.maxX])
          coords.push([round(l.maxX - layerWidth / 2, 1), l.maxX])
        }
      }
    }
  })

  return coords
}

export const getMagnetismCoordYForLayer = (
  state: MagnetismStateSlice,
  layerId: string | false = state.currentSelectedLayerId,
  hasRotation = false
): MagnetismEntry[] => {
  const layer = state.layers[layerId || '']
  const layerHeight = layer.maxY - layer.minY
  const coords: MagnetismEntry[] = [
    [round(state.canvases.height / 2, 1), state.canvases.height / 2],
  ]
  if (!hasRotation) {
    coords.push([round(layerHeight / 2, 1), false])
    coords.push([round(state.canvases.height - layerHeight / 2, 1), false])
    coords.push([round(state.canvases.height / 2 + layerHeight / 2, 1), state.canvases.height / 2])
    coords.push([round(state.canvases.height / 2 - layerHeight / 2, 1), state.canvases.height / 2])
  }

  Object.values(state.layers).forEach((l) => {
    if (l.id !== layerId && Number.isFinite(l.minY) && l.active && l.opacity > 0) {
      const lCenterY = round((l.minY + l.maxY) / 2, 1)
      coords.push([lCenterY, lCenterY])
      if (!hasRotation) {
        if (l.minY > 1) {
          coords.push([round(l.minY + layerHeight / 2, 1), l.minY])
          coords.push([round(l.minY - layerHeight / 2, 1), l.minY])
        }
        if (l.maxY < state.canvases.height - 1) {
          coords.push([round(l.maxY + layerHeight / 2, 1), l.maxY])
          coords.push([round(l.maxY - layerHeight / 2, 1), l.maxY])
        }
      }
    }
  })

  return coords
}

export const getMagnetismCoordLeftForLayer = (
  state: MagnetismStateSlice,
  layerId: string | false = state.currentSelectedLayerId
): MagnetismEntry[] => {
  const coords: MagnetismEntry[] = [
    [0, false],
    [round(state.canvases.width / 2, 1), state.canvases.width / 2],
  ]
  Object.values(state.layers).forEach((l) => {
    if (l.id !== layerId && Number.isFinite(l.minX) && l.active && l.opacity > 0) {
      if (l.minX > 1) {
        coords.push([l.minX, l.minX])
      }
      if (l.maxX < state.canvases.width - 1) {
        coords.push([l.maxX + 1, l.maxX])
      }
    }
  })

  return coords
}

export const getMagnetismCoordRightForLayer = (
  state: MagnetismStateSlice,
  layerId: string | false = state.currentSelectedLayerId
): MagnetismEntry[] => {
  const coords: MagnetismEntry[] = [
    [state.canvases.width, false],
    [round(state.canvases.width / 2, 1), state.canvases.width / 2],
  ]
  Object.values(state.layers).forEach((l) => {
    if (l.id !== layerId && Number.isFinite(l.minX) && l.active && l.opacity > 0) {
      if (l.minX > 1) {
        coords.push([l.minX - 1, l.minX])
      }
      if (l.maxX < state.canvases.width - 1) {
        coords.push([l.maxX, l.maxX])
      }
    }
  })

  return coords
}

export const getMagnetismCoordTopForLayer = (
  state: MagnetismStateSlice,
  layerId: string | false = state.currentSelectedLayerId
): MagnetismEntry[] => {
  const coords: MagnetismEntry[] = [
    [0, false],
    [round(state.canvases.height / 2, 1), state.canvases.height / 2],
  ]
  Object.values(state.layers).forEach((l) => {
    if (l.id !== layerId && Number.isFinite(l.minY) && l.active && l.opacity > 0) {
      if (l.minY > 1) {
        coords.push([l.minY, l.minY])
      }
      if (l.maxY < state.canvases.height - 1) {
        coords.push([l.maxY + 1, l.maxY])
      }
    }
  })

  return coords
}

export const getMagnetismCoordBottomForLayer = (
  state: MagnetismStateSlice,
  layerId: string | false = state.currentSelectedLayerId
): MagnetismEntry[] => {
  const coords: MagnetismEntry[] = [
    [state.canvases.height, false],
    [round(state.canvases.height / 2, 1), state.canvases.height / 2],
  ]
  Object.values(state.layers).forEach((l) => {
    if (l.id !== layerId && Number.isFinite(l.minY) && l.active && l.opacity > 0) {
      if (l.minY > 1) {
        coords.push([l.minY - 1, l.minY])
      }
      if (l.maxY < state.canvases.height - 1) {
        coords.push([l.maxY, l.maxY])
      }
    }
  })

  return coords
}

export interface ExportedLayerItem {
  id: string
  base64?: string
  [key: string]: unknown
}

export const mergeUnchangedLayers = (
  exportedLayers: ExportedLayerItem[],
  previousLayers: ExportedLayerItem[] = []
): ExportedLayerItem[] => {
  return exportedLayers.map((layer) => {
    if (!layer.base64) {
      layer.base64 = previousLayers.find((pl) => pl.id === layer.id)?.base64
    }
    return layer
  })
}
