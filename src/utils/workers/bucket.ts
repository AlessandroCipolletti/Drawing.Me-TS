const MATH = Math

interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const pixelCompare = (
  i: number,
  targetColor: Rgba,
  compareData: Uint8ClampedArray,
  dataLength: number,
  tolerance: number
): boolean => {
  if (i < 0 || i >= dataLength) return false
  return (
    (targetColor.a > 0 || MATH.abs(targetColor.a - compareData[i + 3]) <= tolerance) &&
    MATH.abs(targetColor.r - compareData[i]) <= tolerance &&
    MATH.abs(targetColor.g - compareData[i + 1]) <= tolerance &&
    MATH.abs(targetColor.b - compareData[i + 2]) <= tolerance
  )
}

const pixelCompareAndSet = (
  i: number,
  targetColor: Rgba,
  fillColor: Rgba,
  compareData: Uint8ClampedArray,
  writeData: Uint8ClampedArray,
  dataLength: number,
  tolerance: number,
  boundariesWeekMode: boolean,
  visited: Uint8Array
): boolean => {
  if (i < 0 || i >= dataLength) return false
  const p = i >> 2
  if (visited[p]) return false

  const res = pixelCompare(i, targetColor, compareData, dataLength, tolerance)
  if (res || boundariesWeekMode) {
    visited[p] = 1
    writeData[i + 0] = fillColor.r
    writeData[i + 1] = fillColor.g
    writeData[i + 2] = fillColor.b
    writeData[i + 3] = fillColor.a || writeData[i + 3]
  }
  return res
}

const shouldQueueNeighbor = (
  i: number,
  targetColor: Rgba,
  compareData: Uint8ClampedArray,
  dataLength: number,
  tolerance: number,
  boundariesWeekMode: boolean,
  visited: Uint8Array
): boolean => {
  if (i < 0 || i >= dataLength) return false
  if (visited[i >> 2]) return false
  return pixelCompare(i, targetColor, compareData, dataLength, tolerance) || boundariesWeekMode
}

self.addEventListener('message', (event: MessageEvent) => {
  const {
    id,
    bucketData,
    readData,
    fillColor,
    linePxWidth,
    targetColor,
    boundariesWeekMode,
    tolerance,
  } = event.data
  let i: number = event.data.i

  const writeData: Uint8ClampedArray = bucketData
  const compareData: Uint8ClampedArray = readData ?? bucketData
  const bucketDataLength = writeData.length
  const visited = new Uint8Array(bucketDataLength >> 2)
  const pixelsQueue: number[] = [i]

  while (pixelsQueue.length) {
    i = pixelsQueue.pop()!
    if (
      pixelCompareAndSet(
        i,
        targetColor,
        fillColor,
        compareData,
        writeData,
        bucketDataLength,
        tolerance,
        boundariesWeekMode,
        visited
      )
    ) {
      let leftIndex = i
      let rightIndex = i
      const marginLeft = MATH.trunc(i / linePxWidth) * linePxWidth
      const marginRight = marginLeft + linePxWidth
      while (
        marginLeft < rightIndex &&
        marginLeft < (rightIndex -= 4) &&
        pixelCompareAndSet(
          rightIndex,
          targetColor,
          fillColor,
          compareData,
          writeData,
          bucketDataLength,
          tolerance,
          boundariesWeekMode,
          visited
        )
      ) {
        // scan left boundary
      }
      while (
        marginRight > leftIndex &&
        marginRight > (leftIndex += 4) &&
        pixelCompareAndSet(
          leftIndex,
          targetColor,
          fillColor,
          compareData,
          writeData,
          bucketDataLength,
          tolerance,
          boundariesWeekMode,
          visited
        )
      ) {
        // scan right boundary
      }
      for (let j = rightIndex; j < leftIndex; j += 4) {
        const above = j - linePxWidth
        if (
          shouldQueueNeighbor(
            above,
            targetColor,
            compareData,
            bucketDataLength,
            tolerance,
            boundariesWeekMode,
            visited
          )
        ) {
          pixelsQueue.push(above)
        }
        const below = j + linePxWidth
        if (
          shouldQueueNeighbor(
            below,
            targetColor,
            compareData,
            bucketDataLength,
            tolerance,
            boundariesWeekMode,
            visited
          )
        ) {
          pixelsQueue.push(below)
        }
      }
    }
  }

  const transfer = [writeData.buffer]
  self.postMessage({ id, bucketData: writeData }, transfer as any)
})
