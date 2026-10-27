import Params from 'main/Params'
import { realScreenHeight, realScreenWidth } from './screenSize'
import { isLandscapeOrientation, readVisibleViewport } from 'utils/viewportUtils'

const rotationHandlers: Array<(event?: any) => void> = []

export const mergeObject = (state: Record<string, any>, props: Record<string, any>) => {
  for (const [key, value] of Object.entries(props)) {
    if (typeof state[key] !== 'undefined') {
      state[key] = value
    }
  }
}

export const handleGlobalResize = (event: any = false) => {
  const viewport = readVisibleViewport()
  Params.set('width', viewport.width)
  Params.set('height', viewport.height)

  removeGlobalStatus('drawith__LANDSCAPE')
  removeGlobalStatus('drawith__PORTRAIT')
  addGlobalStatus(isLandscapeOrientation() ? 'drawith__LANDSCAPE' : 'drawith__PORTRAIT')
  document.documentElement.style.setProperty('--100vw', `${Params.width}px`)
  document.documentElement.style.setProperty('--100vh', `${Params.height}px`)

  if (event) {
    for (const handler of rotationHandlers) {
      handler(event)
    }
  }
}

export const addRotationHandler = (handler: (event?: any) => void) => {
  rotationHandlers.push(handler)
}

export const removeRotationHandler = (handler: (event?: any) => void) => {
  if (rotationHandlers.includes(handler)) {
    rotationHandlers.splice(rotationHandlers.indexOf(handler), 1)
  }
}

export const removeGlobalStatus = (status: string) => {
  document.body.classList.remove(status)
}

export const addGlobalStatus = (status: string) => {
  document.body.classList.add(status)
}

export const toggleGlobalStatus = (status: string, add?: boolean) => {
  if (typeof add === 'undefined') {
    if (appHasGlobalStatus(status)) {
      removeGlobalStatus(status)
    } else {
      addGlobalStatus(status)
    }
  } else if (add) {
    addGlobalStatus(status)
  } else {
    removeGlobalStatus(status)
  }
}

export const cleanEventsForNextRefresh = () => {
  let events = JSON.parse(window.sessionStorage.getItem('eventsOnRefresh') || '[]')
  const now = Date.now()
  events = events.filter((e: any) => now - e.time < 60 * 1000)
  window.sessionStorage.setItem('eventsOnRefresh', JSON.stringify(events))
}

export const getRealScreenWidth = (): number => realScreenWidth(Params.isDesktop, Params.pixelRatio)

const getRealScreenHeight = (): number => realScreenHeight(Params.isDesktop, Params.pixelRatio)

export const getRealScreenMaxSize = (): number =>
  Math.max(getRealScreenWidth(), getRealScreenHeight())

const appHasGlobalStatus = (status: string): boolean =>
  Boolean(document.body.classList.contains(status))

const removeEl = (el: any) => {
  if (el instanceof HTMLElement) {
    if (el.tagName.toLowerCase() === 'canvas') {
      ;(el as HTMLCanvasElement).width = 0
      ;(el as HTMLCanvasElement).height = 0
    }
    el.remove()
  } else if (
    typeof CanvasRenderingContext2D !== 'undefined' &&
    el instanceof CanvasRenderingContext2D
  ) {
    if ((el as any).toolImageShape) {
      removeEl((el as any).toolImageShape.canvas)
      ;(el as any).toolImageShape.canvas = null
      ;(el as any).toolImageShape.context = null
      ;(el as any).toolImageShape.cache?.clear()
      ;(el as any).toolImageShape.scaledCache?.clear()
    }
  }
}

export const cleanRefs = (refs: Record<string, any>) => {
  Object.keys(refs).forEach((key) => {
    const ref = refs[key]
    if (ref instanceof HTMLElement) {
      removeEl(ref)
      refs[key] = null
    } else if (Array.isArray(ref)) {
      ref.forEach((el) => {
        removeEl(el)
      })
      refs[key] = []
    } else if (ref && typeof ref === 'object') {
      Object.values(ref).forEach((el) => {
        removeEl(el)
      })
      refs[key] = {}
    }
  })
}
