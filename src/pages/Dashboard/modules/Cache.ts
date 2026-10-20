import { round } from 'utils/mathUtils'
import { getAllLocalDrawings, saveDrawingGpsCoordinates } from 'utils/localDbUtils'
import * as GPS from './GPS'

export interface DashboardDrawingItem {
  id: number
  localDbId: number
  title?: string
  base64: string
  width: number
  height: number
  x: number
  y: number
  px4mm: number
  lat: number
  lon: number
  updateTimestamp: number
}

let cachedDrawings: DashboardDrawingItem[] = []

export const loadLocalDashboardDrawings = async (): Promise<DashboardDrawingItem[]> => {
  const drawings: any[] = (await getAllLocalDrawings()) || []
  const currentPos = GPS.getCurrentCoordinates()
  const px4mm = GPS.getPx4Mm()
  const items: DashboardDrawingItem[] = []

  for (let i = 0; i < drawings.length; i++) {
    const d = drawings[i]
    if (!d || !d.base64) continue

    const width = round((d.width || d.canvasWidth || 600) * px4mm, 0)
    const height = round((d.height || d.canvasHeight || 400) * px4mm, 0)

    let lat = d.gpsCoordinates?.lat
    let lon = d.gpsCoordinates?.lon
    let x = d.dashboardCoordinates?.x
    let y = d.dashboardCoordinates?.y

    const hasValidCoords =
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      typeof x === 'number' &&
      typeof y === 'number' &&
      !(lat === 0 && lon === 0)

    if (!hasValidCoords) {
      // Place drawings that don't have coordinates yet at the current GPS position on the 1 px = 1 mm sheet
      const col = i % 3
      const row = Math.floor(i / 3)
      const offsetX = col * (width + 120)
      const offsetY = row * (height + 120)
      x = currentPos.x - round(width / 2, 0) + offsetX
      y = currentPos.y - round(height / 2, 0) + offsetY
      lat = round(GPS.mm2lat(y / px4mm), 6)
      lon = round(GPS.mm2lon(lat, x / px4mm), 6)

      await saveDrawingGpsCoordinates(
        d.localDbId,
        { lat, lon, accuracy: currentPos.accuracy },
        { x, y, px4mm }
      )
    }

    items.push({
      id: d.localDbId,
      localDbId: d.localDbId,
      title: d.title || `Drawing #${d.localDbId}`,
      base64: d.base64,
      width,
      height,
      x,
      y,
      px4mm: d.dashboardCoordinates?.px4mm || px4mm,
      lat,
      lon,
      updateTimestamp: d.updateTimestamp || Date.now(),
    })
  }

  cachedDrawings = items
  return items
}

export const getCachedDrawings = (): DashboardDrawingItem[] => cachedDrawings

export const getDrawingsInViewport = (
  centerX: number,
  centerY: number,
  viewportW: number,
  viewportH: number
): DashboardDrawingItem[] => {
  const halfW = viewportW / 2
  const halfH = viewportH / 2
  const minX = centerX - halfW
  const maxX = centerX + halfW
  const minY = centerY - halfH
  const maxY = centerY + halfH

  return cachedDrawings.filter((item) => {
    const itemRight = item.x + item.width
    const itemTop = item.y + item.height
    return itemRight >= minX && item.x <= maxX && itemTop >= minY && item.y <= maxY
  })
}

export const pinDrawingAtCurrentPosition = async (
  localDbId: number,
  customX?: number,
  customY?: number
): Promise<DashboardDrawingItem | undefined> => {
  const currentPos = GPS.getCurrentCoordinates()
  const px4mm = GPS.getPx4Mm()
  const existing = cachedDrawings.find((d) => d.localDbId === localDbId)
  const halfW = existing ? round(existing.width / 2, 0) : 0
  const halfH = existing ? round(existing.height / 2, 0) : 0
  const x = (typeof customX === 'number' ? round(customX, 0) : currentPos.x) - halfW
  const y = (typeof customY === 'number' ? round(customY, 0) : currentPos.y) - halfH
  const lat = round(GPS.mm2lat(y / px4mm), 6)
  const lon = round(GPS.mm2lon(lat, x / px4mm), 6)

  await saveDrawingGpsCoordinates(
    localDbId,
    { lat, lon, accuracy: currentPos.accuracy },
    { x, y, px4mm }
  )
  await loadLocalDashboardDrawings()
  return cachedDrawings.find((d) => d.localDbId === localDbId)
}

export const clean = () => {
  cachedDrawings = []
}
