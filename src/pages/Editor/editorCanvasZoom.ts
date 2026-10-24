let readZoom = () => false

export const registerCanvasZoomCheck = (check: () => boolean) => {
  readZoom = check
}

export const currentCanvasHasZoom = () => readZoom()
