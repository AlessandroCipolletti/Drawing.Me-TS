import { v4 as uuidv4 } from 'uuid'
import logoSrc from 'static/img/logoExport.png'
import {
  mergeStackCompositeOperation,
  type LayerBlendMode,
} from 'pages/Editor/components/Layers/layerBlendMode'
import { waitWorkerMessage, postWorkerCommand } from 'utils/jsUtils'
import { getNumberInBetween, round } from 'utils/mathUtils'

const DRAWING_SCALE_RATIO_ON_SHARE = 1
const MIN_LOGO_SIZE = 60
const MAX_LOGO_SIZE = 300
const MAX_THUMBNAIL_SIZE = 400

let logo: HTMLImageElement | undefined

export const resizeImage = (
  image: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas,
  maxSize = MAX_THUMBNAIL_SIZE
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  const imgW = (image as HTMLImageElement).naturalWidth || image.width
  const imgH = (image as HTMLImageElement).naturalHeight || image.height
  const imgRatio = imgW / imgH
  if (imgRatio > 1) {
    canvas.width = maxSize
    canvas.height = maxSize / imgRatio
  } else {
    canvas.height = maxSize
    canvas.width = maxSize * imgRatio
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

let coordsWorker: Worker | null = null
const getCoordsWorker = () => {
  if (!coordsWorker) {
    coordsWorker = new Worker(new URL('./workers/canvasContentCoords.ts', import.meta.url), {
      type: 'module',
    })
  }
  return coordsWorker
}

export const findImageContentCoords = async (
  dom: any,
  pxPrecision = 1,
  alphaTollerance = 0.01
): Promise<{
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}> => {
  alphaTollerance = round(255 * alphaTollerance, 0)
  pxPrecision = round(pxPrecision, 1)

  if (dom.tagName?.toLowerCase() !== 'canvas' && !(dom instanceof OffscreenCanvas)) {
    dom = imgToCanvas(dom, true)
  }

  const width = dom.width
  const height = dom.height
  const ctx = dom.context || dom.getContext('2d')
  const data = ctx.getImageData(0, 0, width, height).data

  const id = uuidv4()
  const worker = getCoordsWorker()
  worker.postMessage({ id, data, width, height, pxPrecision, alphaTollerance }, [data.buffer])
  const res: any = await waitWorkerMessage(worker, id)
  delete res.id
  return res
}

const cropImage = (
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number
): OffscreenCanvas | HTMLCanvasElement => {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(300, 300)
      : document.createElement('canvas')
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    canvas.width = width
    canvas.height = height
    ;(canvas.getContext('2d') as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D)!.drawImage(
      image,
      x,
      y,
      width,
      height,
      0,
      0,
      width,
      height
    )
  }
  return canvas
}

export const flipImage = (
  image: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas,
  horizontally = true
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  canvas.width = (image as HTMLImageElement).naturalWidth || image.width
  canvas.height = (image as HTMLImageElement).naturalHeight || image.height

  if (horizontally) {
    context.scale(-1, 1)
    context.drawImage(image, canvas.width * -1, 0, canvas.width, canvas.height)
  } else {
    context.scale(1, -1)
    context.drawImage(image, 0, canvas.height * -1, canvas.width, canvas.height)
  }

  return canvas
}

const imgToCanvas = (
  img: HTMLImageElement,
  prepareContext = false
): HTMLCanvasElement & { context?: CanvasRenderingContext2D | null } => {
  const canvas = document.createElement('canvas') as HTMLCanvasElement & {
    context?: CanvasRenderingContext2D | null
  }
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  if (prepareContext) {
    canvas.context = canvas.getContext('2d', { willReadFrequently: true })
  }
  return canvas
}

let imgToBase64Worker: Worker | null = null
const getImgToBase64Worker = () => {
  if (!imgToBase64Worker) {
    imgToBase64Worker = new Worker(new URL('./workers/imgToBase64Worker.ts', import.meta.url), {
      type: 'module',
    })
  }
  return imgToBase64Worker
}

let fetchImgWorker: Worker | null = null
const getFetchImgWorker = () => {
  if (!fetchImgWorker) {
    fetchImgWorker = new Worker(new URL('./workers/fetchImgWorker.ts', import.meta.url), {
      type: 'module',
    })
  }
  return fetchImgWorker
}

export const getImgBase64OffThread = async (bitmap: ImageBitmap): Promise<string> => {
  const worker = getImgToBase64Worker()
  const id = uuidv4()
  worker.postMessage({ id, bitmap })
  const res: any = await waitWorkerMessage(worker, id)
  delete res.id

  return res.base64
}

export const duplicateCanvas = (
  sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
  offscreen = false
): HTMLCanvasElement | OffscreenCanvas => {
  let canvas: HTMLCanvasElement | OffscreenCanvas
  if (offscreen) {
    canvas = new OffscreenCanvas(sourceCanvas.width, sourceCanvas.height)
  } else {
    canvas = document.createElement('canvas')
    canvas.width = sourceCanvas.width
    canvas.height = sourceCanvas.height
  }
  const context = canvas.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  context.drawImage(sourceCanvas, 0, 0)
  return canvas
}

export type MergeImageEntry = [
  HTMLImageElement | HTMLCanvasElement | OffscreenCanvas,
  number?,
  LayerBlendMode?,
]

export const mergeImages = (images: Array<MergeImageEntry>): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  canvas.width = canvas.height = 0
  let isFirstDraw = true
  for (const [img, opacity = 1, blendMode = 'normal'] of images) {
    const imgW = (img as HTMLImageElement).naturalWidth || img.width
    const imgH = (img as HTMLImageElement).naturalHeight || img.height
    if (imgW > 1) {
      if (!canvas.width) {
        canvas.width = imgW
        canvas.height = imgH
      }
      context.globalCompositeOperation = mergeStackCompositeOperation(isFirstDraw, blendMode)
      isFirstDraw = false
      context.globalAlpha = opacity
      context.drawImage(img, 0, 0)
    }
  }
  context.globalAlpha = 1
  context.globalCompositeOperation = 'source-over'
  return canvas
}

export const getCanvasFromBase64 = async (base64: string): Promise<HTMLCanvasElement> => {
  const img = await fetchImgOffThread(base64)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  context.drawImage(img, 0, 0)
  return canvas
}

const fetchImgOffThread = async (url: string): Promise<HTMLImageElement> => {
  const worker = getFetchImgWorker()
  const { blob }: any = await postWorkerCommand(worker, { url })

  const blobUrl = URL.createObjectURL(blob)
  const img = await getImageFromUrl(blobUrl)
  URL.revokeObjectURL(blobUrl)

  return img
}

export const getImageFromUrl = async (url: string): Promise<HTMLImageElement> => {
  const img = new Image()
  img.crossOrigin = 'Anonymous'
  await setImageSrcSync(img, url)
  return img
}

const setImageSrcSync = (img: HTMLImageElement, src: string): Promise<boolean> => {
  return new Promise((resolve) => {
    img.onload = () => {
      img.onerror = img.onload = null
      resolve(true)
    }
    img.onerror = () => {
      img.onerror = img.onload = null
      resolve(false)
    }
    img.src = src
  })
}

export const shareImageWithBase64 = async (
  img: HTMLImageElement | HTMLCanvasElement,
  bgWhite = false
): Promise<string> => {
  const shareCanvas = document.createElement('canvas')
  const shareCtx = shareCanvas.getContext('2d')!
  shareCanvas.width =
    ((img as HTMLImageElement).naturalWidth || img.width) * DRAWING_SCALE_RATIO_ON_SHARE
  shareCanvas.height =
    ((img as HTMLImageElement).naturalHeight || img.height) * DRAWING_SCALE_RATIO_ON_SHARE

  if (bgWhite) {
    shareCtx.fillStyle = '#FFFFFF'
    shareCtx.fillRect(0, 0, shareCanvas.width, shareCanvas.height)
  }

  shareCtx.drawImage(img, 0, 0, shareCanvas.width, shareCanvas.height)

  logo = logo || (await getImageFromUrl(logoSrc))
  const maxSide = Math.max(shareCanvas.width, shareCanvas.height)
  const minSide = Math.min(shareCanvas.width, shareCanvas.height)
  const margin = Math.min(minSide * 0.03, 10)
  const logoRatio = logo.naturalWidth / logo.naturalHeight
  const logoWidth = getNumberInBetween(maxSide * 0.1, MIN_LOGO_SIZE, MAX_LOGO_SIZE)
  const logoHeight = logoWidth / logoRatio
  shareCtx.drawImage(
    logo,
    shareCanvas.width - logoWidth - margin,
    shareCanvas.height - logoHeight - margin,
    logoWidth,
    logoHeight
  )

  return shareCanvas.toDataURL('image/png')
}

export const cropImageWithMargin = (
  image: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas,
  l: number,
  t: number,
  r: number,
  b: number,
  margin = 0.1
): [any, number, number, number, number] => {
  const imageWidth = (image as HTMLImageElement).naturalWidth || image.width
  const imageHeight = (image as HTMLImageElement).naturalHeight || image.height
  let w = round(r - l, 0)
  let h = round(b - t, 0)
  const x = round(Math.max(l - w * (margin / 2), 0), 0)
  const y = round(Math.max(t - h * (margin / 2), 0), 0)
  w = round(Math.min(w * (1 + margin), imageWidth - x), 0)
  h = round(Math.min(h * (1 + margin), imageHeight - y), 0)
  return [cropImage(image, x, y, w, h), x, y, w, h]
}

export const init = () => {}
