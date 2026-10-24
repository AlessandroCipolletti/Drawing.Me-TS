import { isLandscapeOrientation } from './viewportUtils'

export const realScreenWidth = (isDesktop: boolean, pixelRatio: number): number => {
  if (isDesktop) {
    return Math.trunc(screen.width * pixelRatio)
  }
  const screenLongSide = Math.max(screen.width, screen.height)
  const screenShortSide = Math.min(screen.width, screen.height)
  if (isLandscapeOrientation()) {
    return Math.trunc(screenLongSide * pixelRatio)
  }
  return Math.trunc(screenShortSide * pixelRatio)
}

export const realScreenHeight = (isDesktop: boolean, pixelRatio: number): number => {
  if (isDesktop) {
    return Math.trunc(screen.height * pixelRatio)
  }
  const screenLongSide = Math.max(screen.width, screen.height)
  const screenShortSide = Math.min(screen.width, screen.height)
  if (!isLandscapeOrientation()) {
    return Math.trunc(screenLongSide * pixelRatio)
  }
  return Math.trunc(screenShortSide * pixelRatio)
}
