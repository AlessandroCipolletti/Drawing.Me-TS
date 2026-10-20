import { describe, it, expect } from 'vitest'
import {
  lon2mm,
  lat2mm,
  mm2lat,
  mm2lon,
  coordGps2px,
  pxy2scale,
  getPx4Mm,
  hasFix,
} from 'pages/Dashboard/modules/GPS'
import {
  drawingIsSaving,
  setBackgroundSavingId,
  DRAWING_STATE_SAVING_LOCALLY,
  DRAWING_STATE_SAVED_LOCALLY,
} from 'utils/localDbUtils'
import History from 'modules/History'

describe('GPS 1px = 1mm World Sheet Math', () => {
  it('uses a 1 px = 1 mm scale and matches exact WGS84 Mercator Paris coordinates from docs/statistica gps.txt', () => {
    expect(getPx4Mm()).toBe(1)
    expect(hasFix()).toBe(false)

    // Exact Paris coordinates from docs/statistica gps.txt:
    // Coordinate attuali: [48.8464239, 2.3518060999999997]
    // Coordinate convertite: [261801857.5, 6216652897.8]
    const parisLat = 48.8464239
    const parisLon = 2.3518060999999997
    const [parisX, parisY] = coordGps2px(parisLat, parisLon)
    expect(parisX).toBe(261801857.5)
    expect(parisY).toBe(6216652897.8)

    const lat = 45.4642
    const lon = 9.19
    const [xPx, yPx] = coordGps2px(lat, lon)

    expect(xPx).toBeGreaterThan(0)
    expect(yPx).toBeGreaterThan(0)

    const recoveredLat = mm2lat(lat2mm(lat))
    const recoveredLon = mm2lon(lat, lon2mm(lat, lon))

    expect(recoveredLat).toBeCloseTo(lat, 5)
    expect(recoveredLon).toBeCloseTo(lon, 5)

    const [normX, normY] = pxy2scale(xPx, yPx)
    expect(normX).toBeGreaterThan(0)
    expect(normX).toBeLessThan(1)
    expect(normY).toBeGreaterThan(0)
    expect(normY).toBeLessThan(1)
  })
})

describe('Two-phase Save Spinner & History Bug Fixes', () => {
  it('keeps drawingIsSaving true continuously across Phase 1 and Phase 2 background layer export', () => {
    const drawingId = 77
    const phase1Drawing = { localDbId: drawingId, state: DRAWING_STATE_SAVING_LOCALLY }
    expect(drawingIsSaving(phase1Drawing)).toBe(true)

    // Even if DB state transitions or while background export is in flight, backgroundSavingIds keeps spinner active
    setBackgroundSavingId(drawingId, true)
    expect(drawingIsSaving({ localDbId: drawingId, state: DRAWING_STATE_SAVED_LOCALLY })).toBe(true)

    // Once Phase 2 finishes saving layers, spinner is cleared
    setBackgroundSavingId(drawingId, false)
    expect(drawingIsSaving({ localDbId: drawingId, state: DRAWING_STATE_SAVED_LOCALLY })).toBe(
      false
    )
  })

  it('tracks undo/redo history cleanly in History ring buffer', () => {
    const history = new History<{ step: number }>(5)
    history.add({ step: 1 })
    history.add({ step: 2 })
    expect(history.canGoBack).toBe(true)
    expect(history.canGoForward).toBe(false)

    history.back()
    expect(history.getCurrent()).toEqual({ step: 1 })
    expect(history.canGoBack).toBe(false)
    expect(history.canGoForward).toBe(true)

    history.forward()
    expect(history.getCurrent()).toEqual({ step: 2 })
  })
})
