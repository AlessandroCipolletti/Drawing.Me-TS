const MATH = Math
const PI = MATH.PI

export const getNumberInBetween = (a: number, b: number, c: number, decimals = 4): number => {
  const min = a < b ? a : b
  const max = a > b ? a : b
  const clamped = c < min ? min : c > max ? max : c
  return round(clamped, decimals)
}

export const getRandomNumber = (n: number, float = false): number =>
  float ? MATH.random() * n : (MATH.random() * n) | 0

export const getAngleDegBetweenTwoPoints = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => convertAngleRadToDeg(getAngleRadBetweenTwoPoints(x1, y1, x2, y2))

export const getPerc = (value: number, total: number, decimals = 4): number =>
  round(!total ? value : (value * 100) / total, decimals)

export const getDistanceBetweenTwoPoints = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  decimals = 0
): number => {
  const dx = x2 - x1
  const dy = y2 - y1
  return round(MATH.sqrt(dx * dx + dy * dy), decimals)
}

export const distanceBetweenTwoPointsGreaterThan = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  distance: number
): boolean => {
  const dx = x2 - x1
  const dy = y2 - y1
  return dx * dx + dy * dy >= distance * distance
}

export const convertAngleRadToDeg = (rad: number): number => (rad * 180) / PI
export const convertAngleDegToRad = (deg: number): number => (deg * PI) / 180

export const rotateCoords = (x: number, y: number, a: number): [number, number] => [
  round(x * MATH.cos(a) + y * MATH.sin(a)),
  round(-x * MATH.sin(a) + y * MATH.cos(a)),
]

const translateCoords = (x: number, y: number, dx: number, dy: number): [number, number] => [
  x + dx,
  y + dy,
]

export const getMiddlePointCoords = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  decimals = 0
): [number, number] => [round((x1 + x2) / 2, decimals), round((y1 + y2) / 2, decimals)]

export const getAverage = (values: number[] = [], decimals = 0): number =>
  round(values.reduce((t, v) => t + v, 0) / values.length, decimals)

const getSlopeCoefficientBetweenTwoPoints = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => (y2 - y1) / (x2 - x1)

const getPerpendicularLineFunctionPassingByPoint =
  (slope: number, x1: number, y1: number) =>
  (x: number): number =>
    (-1 / slope) * (x - x1) + y1

export const getScopeCoefficientBetweenTwoPoints = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => -(y2 - y1) / (x2 - x1)

export const quadraticBezierValue = (t: number, p1: number, p2: number, p3: number): number =>
  (1 - t) * (1 - t) * p1 + 2 * (1 - t) * t * p2 + t * t * p3

export const getQuadraticBezierCurvePointAtTime = (
  t: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  d = 0
): [number, number] => [
  round((1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * x2 + t * t * x3, d),
  round((1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * y2 + t * t * y3, d),
]

export const logarithmicPercToValue = (
  perc: number,
  minValue: number,
  maxValue: number,
  decimals = 0
): number => {
  minValue = Math.log(minValue)
  maxValue = Math.log(maxValue)
  const scale = (maxValue - minValue) / 100
  return round(Math.exp(minValue + scale * perc), decimals)
}

export const logarithmicValueToPerc = (
  value: number,
  minValue: number,
  maxValue: number,
  decimals = 0
): number => {
  minValue = Math.log(minValue)
  maxValue = Math.log(maxValue)
  const scale = (maxValue - minValue) / 100
  if (scale > 0) {
    return round((Math.log(value) - minValue) / scale, decimals)
  }
  return 100
}

export const getOriginalCoordsFromScaleRotation = (
  x: number,
  y: number,
  originX: number,
  originY: number,
  scale: number,
  rotation: number
): [number, number] => {
  ;[x, y] = translateCoords(x, y, -originX, -originY)
  ;[x, y] = rotateCoords(x, y, convertAngleDegToRad(rotation))
  return [round(x / scale, 1), round(y / scale, 1)]
}

export const round = (n: number, d = 0): number => {
  const m = d ? MATH.pow(10, d) : 1
  return MATH.round(n * m) / m
}

const getIntersectionBetween4Points = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
  d = 0
): [number | false, number | false] => {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1)
  if (denom === 0) {
    return [false, false]
  }
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom
  return [round(x1 + ua * (x2 - x1), d), round(y1 + ua * (y2 - y1), d)]
}

export const getPointProjectionOnLine = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number
): [number | false, number | false] => {
  let x4: number
  let y4: number
  const slopeLine1 = getSlopeCoefficientBetweenTwoPoints(x1, y1, x2, y2)
  if (slopeLine1 === 0) {
    x4 = x3
    y4 = y1
  } else if (isFinite(slopeLine1)) {
    const line2 = getPerpendicularLineFunctionPassingByPoint(slopeLine1, x3, y3)
    if (x3 === x1) {
      x4 = x2
    } else {
      x4 = x1
    }
    y4 = line2(x4)
  } else {
    x4 = x1
    y4 = y3
  }
  return getIntersectionBetween4Points(x1, y1, x2, y2, x3, y3, x4, y4)
}

export const degToFirstQuadrant = (deg: number): number => {
  const mod180 = MATH.abs(deg) % 180
  return mod180 > 90 ? 180 - mod180 : mod180
}

export const getAngleRadBetweenTwoPoints = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) {
    return PI * 1.5
  }
  const angle = MATH.atan2(dy, dx)
  return angle < 0 ? angle + PI * 2 : angle
}

export const getDistanceBetweenThreePoints = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  decimals = 1
): number => {
  return round(
    (getDistanceBetweenTwoPoints(x1, y1, x2, y2, decimals) || 0) +
      (getDistanceBetweenTwoPoints(x2, y2, x3, y3, decimals) || 0),
    decimals
  )
}

export const roundAngleForSteps = (deg: number, step = 3, interval = 45): number => {
  const delta = deg % interval
  if (Math.abs(Math.trunc(delta)) < step) {
    return deg - delta
  }
  if (Math.abs(Math.trunc(delta)) > interval - step) {
    if (delta > 0) {
      return Math.round(deg + interval - delta)
    } else {
      return Math.round(deg - interval - delta)
    }
  }
  return deg
}

export const getAltitudeFactorFromAngle = (angle: number, maxFactor: number): number =>
  getNumberInBetween(0, 1, (1 - angle / (Math.PI / 2)) / maxFactor)
