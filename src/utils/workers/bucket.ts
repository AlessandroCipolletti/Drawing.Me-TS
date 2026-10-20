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
  bucketData: Uint8ClampedArray,
  bucketDataLength: number,
  tolerance: number
): boolean => {
  if (i < 0 || i >= bucketDataLength) return false
  return (
    (targetColor.a > 0 || MATH.abs(targetColor.a - bucketData[i + 3]) <= tolerance) &&
    MATH.abs(targetColor.r - bucketData[i]) <= tolerance &&
    MATH.abs(targetColor.g - bucketData[i + 1]) <= tolerance &&
    MATH.abs(targetColor.b - bucketData[i + 2]) <= tolerance
  )
}

const pixelCompareAndSet = (
  i: number,
  targetColor: Rgba,
  fillColor: Rgba,
  bucketData: Uint8ClampedArray,
  bucketDataLength: number,
  tolerance: number,
  boundariesWeekMode: boolean
): boolean => {
  const res = pixelCompare(i, targetColor, bucketData, bucketDataLength, tolerance)
  if (res || boundariesWeekMode) {
    bucketData[i + 0] = fillColor.r
    bucketData[i + 1] = fillColor.g
    bucketData[i + 2] = fillColor.b
    bucketData[i + 3] = fillColor.a || bucketData[i + 3]
  }
  return res
}

self.addEventListener('message', (event: MessageEvent) => {
  const { id, bucketData, fillColor, linePxWidth, targetColor, boundariesWeekMode, tolerance } =
    event.data
  let i: number = event.data.i

  const bucketDataLength = bucketData.length
  const pixelsQueue: number[] = [i]

  while (pixelsQueue.length) {
    i = pixelsQueue.pop()!
    if (
      pixelCompareAndSet(
        i,
        targetColor,
        fillColor,
        bucketData,
        bucketDataLength,
        tolerance,
        boundariesWeekMode
      )
    ) {
      let leftIndex = i
      let rightIndex = i
      const marginLeft = Math.trunc(i / linePxWidth) * linePxWidth
      const marginRight = marginLeft + linePxWidth
      while (
        marginLeft < rightIndex &&
        marginLeft < (rightIndex -= 4) &&
        pixelCompareAndSet(
          rightIndex,
          targetColor,
          fillColor,
          bucketData,
          bucketDataLength,
          tolerance,
          boundariesWeekMode
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
          bucketData,
          bucketDataLength,
          tolerance,
          boundariesWeekMode
        )
      ) {
        // scan right boundary
      }
      for (let j = rightIndex; j < leftIndex; j += 4) {
        if (
          j - linePxWidth >= 0 &&
          (pixelCompare(j - linePxWidth, targetColor, bucketData, bucketDataLength, tolerance) ||
            boundariesWeekMode)
        ) {
          pixelsQueue.push(j - linePxWidth)
        }
        if (
          j + linePxWidth < bucketDataLength &&
          (pixelCompare(j + linePxWidth, targetColor, bucketData, bucketDataLength, tolerance) ||
            boundariesWeekMode)
        ) {
          pixelsQueue.push(j + linePxWidth)
        }
      }
    }
  }

  self.postMessage({ id, bucketData }, [bucketData.buffer] as any)
})
