export interface CoworkingEventMap {
  closeFolderPopup: void
  updateFolderDrawingsLoading: void
}

type Handler<T> = (payload: T) => void

const listeners: {
  [K in keyof CoworkingEventMap]?: Set<Handler<CoworkingEventMap[K]>>
} = {}

export const onCoworkingEvent = <K extends keyof CoworkingEventMap>(
  event: K,
  handler: Handler<CoworkingEventMap[K]>
): (() => void) => {
  if (!listeners[event]) {
    listeners[event] = new Set()
  }
  const set = listeners[event]!
  set.add(handler)
  return () => {
    set.delete(handler)
  }
}

export const emitCoworkingEvent = <K extends keyof CoworkingEventMap>(
  event: K,
  payload: CoworkingEventMap[K]
): void => {
  const set = listeners[event]
  if (!set) return
  for (const fn of set) {
    fn(payload)
  }
}
