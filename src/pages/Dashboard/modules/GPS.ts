import * as Messages from 'modules/Messages'
import { round, convertAngleDegToRad, convertAngleRadToDeg } from 'utils/mathUtils'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'

export interface GpsPosition {
  lat: number
  lon: number
  accuracy: number
  x: number
  y: number
}

const config = {
  WGS84: {
    // Earth radius in millimeters (1 px = 1 mm)
    r_major: 6378137000, // Equatorial Radius, WGS84
    r_minor: 6356752314.245179, // Polar Radius, WGS84
    f: 298.257223563, // WGS84 Ellipsoid flattening factor
  },
  px4mm: 1, // 1 pixel = 1 millimeter on the world sheet
  gpsRefreshTime: 5 * 1000,
  gpsTimeoutTime: 25 * 1000,
  defaultLat: 48.8464239, // Paris reference from docs/statistica gps.txt
  defaultLon: 2.3518060999999997,
}

const labels = {
  error: 'Geolocalisation error',
}

const R_RATIO = config.WGS84.r_minor / config.WGS84.r_major
const ECCENT = Math.sqrt(1.0 - R_RATIO * R_RATIO)
const COM = 0.5 * ECCENT

const state: {
  initFinished: boolean
  watchPositionProcess: number | false
  gpsInterval: ReturnType<typeof setInterval> | false
  currentCoordinates: GpsPosition
  maxWidth: number
  maxHeight: number
} = {
  initFinished: false,
  watchPositionProcess: false,
  gpsInterval: false,
  currentCoordinates: {
    lat: config.defaultLat,
    lon: config.defaultLon,
    accuracy: 10,
    x: 0,
    y: 0,
  },
  maxWidth: 0,
  maxHeight: 0,
}

/**
 * WGS84 Mercator projection: converts longitude in degrees to millimeters (`r_major = 6378137000`).
 * Supports both `lon2mm(lon)` (original GPS.js signature) and `lon2mm(lat, lon)`.
 */
export const lon2mm = (lonOrLat: number, maybeLon?: number): number => {
  const lon = typeof maybeLon === 'number' ? maybeLon : lonOrLat
  return config.WGS84.r_major * convertAngleDegToRad(lon)
}

/**
 * WGS84 Ellipsoidal Mercator projection: converts latitude in degrees to millimeters (`r_major = 6378137000`).
 * Matches `src/pages/Dashboard/modules/GPS.js` and `docs/statistica gps.txt`
 * (`lat2mm(48.8464239) -> 6216652897.8`, `lon2mm(2.3518060999999997) -> 261801857.5`).
 */
export const lat2mm = (lat: number): number => {
  lat = Math.min(89.5, Math.max(lat, -89.5))
  const phi = convertAngleDegToRad(lat)
  const sinphi = Math.sin(phi)
  const con = ECCENT * sinphi
  const conPow = Math.pow((1.0 - con) / (1.0 + con), COM)
  const ts = Math.tan(0.5 * (Math.PI * 0.5 - phi)) / conPow
  return 0 - config.WGS84.r_major * Math.log(ts)
}

/**
 * Inverse WGS84 Ellipsoidal Mercator: converts millimeters to latitude in degrees.
 */
export const mm2lat = (y: number): number => {
  const ts = Math.exp(-y / config.WGS84.r_major)
  let phi = Math.PI * 0.5 - 2 * Math.atan(ts)
  for (let i = 0; i < 15; i++) {
    const con = ECCENT * Math.sin(phi)
    const dphi = Math.PI * 0.5 - 2 * Math.atan(ts * Math.pow((1.0 - con) / (1.0 + con), COM)) - phi
    phi += dphi
    if (Math.abs(dphi) <= 1e-10) break
  }
  return convertAngleRadToDeg(phi)
}

/**
 * Inverse WGS84 Mercator: converts millimeters to longitude in degrees.
 * Supports both `mm2lon(x)` and `mm2lon(lat, x)`.
 */
export const mm2lon = (xOrLat: number, maybeX?: number): number => {
  const x = typeof maybeX === 'number' ? maybeX : xOrLat
  return convertAngleRadToDeg(x / config.WGS84.r_major)
}

export const pxy2scale = (
  x: number,
  y: number,
  maxWidth = state.maxWidth || round(lon2mm(180) * 2 * config.px4mm, 0),
  maxHeight = state.maxHeight || round(lat2mm(90) * 2 * config.px4mm, 0)
): [number, number] => [x / maxWidth, 1 - y / maxHeight]

export const coordGps2px = (
  lat = state.currentCoordinates.lat,
  lon = state.currentCoordinates.lon
): [number, number] => [round(lon2mm(lon) * config.px4mm, 1), round(lat2mm(lat) * config.px4mm, 1)]

export const currentGps2px = (): [number, number] => [
  state.currentCoordinates.x,
  state.currentCoordinates.y,
]

export const getCurrentCoordinates = (): GpsPosition => ({ ...state.currentCoordinates })

const setCurrentCoordinates = (lat: number, lon: number, accuracy = 10): GpsPosition => {
  const [x, y] = coordGps2px(lat, lon)
  state.currentCoordinates = {
    lat: round(lat, 7),
    lon: round(lon, 7),
    accuracy: round(accuracy, 0),
    x,
    y,
  }
  return getCurrentCoordinates()
}

const getWorldMaxDimensions = (): [number, number] => {
  if (!state.maxWidth || !state.maxHeight) {
    state.maxWidth = round(lon2mm(180) * 2 * config.px4mm, 0)
    state.maxHeight = round(lat2mm(90) * 2 * config.px4mm, 0)
  }
  return [state.maxWidth, state.maxHeight]
}

export const getPx4Mm = (): number => config.px4mm

export const hasFix = (): boolean => state.initFinished

const applyBrowserPosition = (position: GeolocationPosition) => {
  setCurrentCoordinates(
    position.coords.latitude,
    position.coords.longitude,
    position.coords.accuracy
  )
}

export const stopWatchingPosition = () => {
  if (
    state.watchPositionProcess !== false &&
    typeof navigator !== 'undefined' &&
    navigator.geolocation
  ) {
    navigator.geolocation.clearWatch(state.watchPositionProcess)
    state.watchPositionProcess = false
  }
  if (state.gpsInterval !== false) {
    clearInterval(state.gpsInterval)
    state.gpsInterval = false
  }
  removeGlobalStatus('drawith__GPS-ON')
}

export const init = (timeoutOverrideMs?: number): Promise<[number, number]> => {
  getWorldMaxDimensions()
  setCurrentCoordinates(state.currentCoordinates.lat, state.currentCoordinates.lon, 10)

  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      state.initFinished = true
      resolve([state.maxWidth, state.maxHeight])
      return
    }

    let settled = false
    const finish = () => {
      if (!settled) {
        settled = true
        state.initFinished = true
        resolve([state.maxWidth, state.maxHeight])
      }
    }

    const effectiveTimeout = timeoutOverrideMs ?? Math.min(config.gpsTimeoutTime, 2000)
    const timeoutId = setTimeout(finish, effectiveTimeout)

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId)
          applyBrowserPosition(position)
          addGlobalStatus('drawith__GPS-ON')
          finish()
        },
        (err) => {
          clearTimeout(timeoutId)
          removeGlobalStatus('drawith__GPS-ON')
          if (err && typeof err.code === 'number') {
            Messages.error(labels.error)
          }
          finish()
        },
        {
          maximumAge: config.gpsRefreshTime,
          timeout: config.gpsTimeoutTime,
          enableHighAccuracy: true,
        }
      )
    } catch {
      clearTimeout(timeoutId)
      removeGlobalStatus('drawith__GPS-ON')
      Messages.error(labels.error)
      finish()
    }
  })
}
