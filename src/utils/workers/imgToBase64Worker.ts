const imgToCanvas = (img: ImageBitmap) => {
  const canvas = new OffscreenCanvas(img.width, img.height)
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  return canvas
}

const getCanvasBlobAsync = (canvas: OffscreenCanvas): Promise<Blob> => {
  return canvas.convertToBlob()
}

const blobToBase64Async = (blob: Blob): Promise<string> => {
  return new Promise((resolve) => {
    let reader: FileReader | undefined = new FileReader()
    reader.onload = () => {
      resolve(reader!.result as string)
      reader = undefined
    }
    reader.readAsDataURL(blob)
  })
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { id, bitmap } = event.data
  const canvas = imgToCanvas(bitmap)
  const imgBlob = await getCanvasBlobAsync(canvas)
  const base64 = await blobToBase64Async(imgBlob)
  self.postMessage({ id, base64 })
})
