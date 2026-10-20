self.addEventListener('message', (event: MessageEvent) => {
  const { id, data, width, height, pxPrecision, alphaTollerance } = event.data

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = 0; y < height; y += pxPrecision) {
    const rowOffset = y * width
    for (let x = 0; x < width; x += pxPrecision) {
      if (data[(rowOffset + x) * 4 + 3] > alphaTollerance) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x + 1 > maxX) maxX = x + 1
        if (y + 1 > maxY) maxY = y + 1
      }
    }
  }

  self.postMessage({ id, minX, minY, maxX, maxY })
})
