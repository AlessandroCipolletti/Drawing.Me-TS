/// <reference types="vite/client" />

declare module '*.tpl?raw' {
  const content: string
  export default content
}

declare module '*.tpl' {
  const content: string
  export default content
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.gif' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.webp' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module 'debounce' {
  export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    wait?: number,
    immediate?: boolean
  ): T & { clear(): void; flush(): void }
  export default debounce
}

declare module 'segment-js' {
  export default class Segment {
    constructor(
      path: SVGPathElement | Element | null,
      begin?: number | string,
      end?: number | string,
      circular?: boolean
    )
    draw(
      begin: number | string,
      end: number | string,
      duration?: number,
      options?: {
        delay?: number
        easing?: (t: number) => number
        circular?: boolean
        callback?: () => void
      }
    ): void
  }
}

declare module 'mobile-device-detect' {
  export const isAndroid: boolean
  export const osName: string
  export const osVersion: string
  export const isMobileOnly: boolean
  export const isMobile: boolean
  export const isTablet: boolean
  export const isBrowser: boolean
  export const isIOS: boolean
  export const isMacOs: boolean
  export const isIPad13: boolean
  export const browserName: string
  export const browserVersion: string
  export const isSmartTV: boolean
  export const isWearable: boolean
  export const isIE: boolean
  export const isConsole: boolean
  export const isWinPhone: boolean
  export const isOpera: boolean
}
