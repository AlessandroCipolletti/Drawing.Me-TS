export interface ListenerScope {
  on<T extends EventTarget>(
    target: T | null | undefined,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
  dispose(): void
}

export const createListenerScope = (): ListenerScope => {
  const cleanups: Array<() => void> = []
  return {
    on(target, type, listener, options) {
      if (!target) return
      target.addEventListener(type, listener, options)
      cleanups.push(() => target.removeEventListener(type, listener, options))
    },
    dispose() {
      while (cleanups.length > 0) {
        const fn = cleanups.pop()
        fn?.()
      }
    },
  }
}

const filterNonTextNodes = (node: Node): node is HTMLElement => node.nodeName !== '#text'

export const mount = <T extends HTMLElement = HTMLElement>(
  container: HTMLElement | false | null | undefined,
  node: T | DocumentFragment | HTMLElement[]
): T => {
  if (Array.isArray(node)) {
    if (container) {
      for (const item of node) {
        container.appendChild(item)
      }
    }
    return node[0] as T
  }

  if (node.nodeName === '#document-fragment') {
    const children = Array.from(node.childNodes).filter(filterNonTextNodes)
    if (container) {
      for (const child of children) {
        container.appendChild(child)
      }
    }
    return (children.length === 1 ? children[0] : (children as unknown)) as T
  }

  if (container) {
    container.appendChild(node)
  }
  return node as T
}

export const unmount = (
  root: HTMLElement | HTMLElement[] | null | undefined,
  scope?: ListenerScope
): void => {
  scope?.dispose()
  if (!root) return
  if (Array.isArray(root)) {
    for (const el of root) {
      el.remove()
    }
  } else {
    root.remove()
  }
}
