import { v4 as uuidv4 } from 'uuid'

let onJsError: () => void = () => {}

export const registerJsErrorCleanup = (cleanup: () => void) => {
  onJsError = cleanup
}

export const isEqual = (a: any, b: any): boolean => {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false
    }
    return true
  }
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]
    if (!Object.prototype.hasOwnProperty.call(b, key) || !isEqual(a[key], b[key])) {
      return false
    }
  }
  return true
}

const fibonacciTimeoutSequence = [
  1, 1, 1, 2, 2, 2, 3, 3, 3, 5, 5, 5, 8, 8, 8, 13, 13, 13, 21, 21, 21, 34, 34, 34, 55, 55, 55,
]
const maxFibonacciTimeout = 55

export const exponentialTimeout = (fn: () => boolean, iteration = 0) => {
  setTimeout(
    () => {
      const shouldTryAgain = fn()
      if (shouldTryAgain) {
        exponentialTimeout(fn, iteration + 1)
      }
    },
    (fibonacciTimeoutSequence[iteration] ?? maxFibonacciTimeout) * 1000
  )
}

export const delay = (time = 0): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, time))

export const deepCopy = <T>(value: T): T => {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepCopy(item)) as unknown as T
  }
  const copy: Record<string, any> = {}
  for (const [k, v] of Object.entries(value as Record<string, any>)) {
    if (v !== undefined && typeof v !== 'function') {
      copy[k] = deepCopy(v)
    }
  }
  return copy as T
}

export const securizeAsyncFn = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  errorMsg = '',
  fnName = '',
  showErrorMsg = true
) => {
  return async function (this: any, ...args: Parameters<T>): Promise<any> {
    try {
      return await fn.apply(this, args)
    } catch (error) {
      await delay(100)
      handleJsError(fn, error, errorMsg, fnName, showErrorMsg)
      return false
    }
  }
}

const handleJsError = (
  fn: (...args: any[]) => any,
  error: any,
  errorMsg: string,
  fnName: string,
  showErrorMsg = true
) => {
  console.error(errorMsg, fn?.name || fnName, error?.stack || error)
  onJsError()
  if (showErrorMsg && (window as any).Messages?.error) {
    ;(window as any).Messages.error(errorMsg)
  }
}

export const iterateFn = async (
  els: any,
  fn: (...args: any[]) => any,
  params: any[] = []
): Promise<void> => {
  if (Array.isArray(els)) {
    const promises = els.map(async (el) => {
      await fn(el, ...params)
    })
    await Promise.all(promises)
  } else if (els) {
    await fn(els, ...params)
  }
}

export const debounce = <T extends (...args: any[]) => any>(callback: T, limit = 100) => {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return function (this: any, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => {
      callback.apply(this, args)
    }, limit)
  }
}

export const throttle = <T extends (...args: any[]) => any>(callback: T, limit = 100) => {
  let waiting = false
  return function (this: any, ...args: Parameters<T>) {
    if (!waiting) {
      callback.apply(this, args)
      waiting = true
      setTimeout(() => {
        waiting = false
      }, limit)
    }
  }
}

export const debounceThrottle = <T extends (...args: any[]) => any>(callback: T, limit = 100) => {
  let waiting = false
  let lastCallback: T | null = null
  let lastArguments: any[] | null = null
  return function (this: any, ...args: Parameters<T>) {
    if (waiting) {
      lastCallback = callback
      lastArguments = args
    } else {
      callback.apply(this, args)
      waiting = true
      setTimeout(() => {
        if (lastCallback && lastArguments) {
          lastCallback.apply(this, lastArguments as Parameters<T>)
          lastCallback = lastArguments = null
          setTimeout(() => {
            waiting = false
          }, limit)
        } else {
          waiting = false
        }
      }, limit)
    }
  }
}

export const callCallbackIfDataChanged = <T extends (...args: any[]) => any>(callback: T) => {
  let lastArguments: any[] = []
  return function (this: any, ...newArguments: Parameters<T>) {
    let changed = false
    for (let i = 0; i < newArguments.length; i++) {
      if (!isEqual(lastArguments[i], newArguments[i])) {
        changed = true
        break
      }
    }
    if (changed) {
      lastArguments = newArguments
      callback.apply(this, newArguments)
    }
  }
}

export const shiftArrayElement = <T>(arr: T[], oldIndex: number, newIndex: number) => {
  arr.splice(newIndex, 0, arr.splice(oldIndex, 1)[0])
}

export const noop = () => {}

export const waitWorkerMessage = (worker: Worker, id: string): Promise<any> => {
  return new Promise((resolve) => {
    const onLoaded = (event: MessageEvent) => {
      const { id: idMsg } = event.data
      if (id === idMsg) {
        worker.removeEventListener('message', onLoaded)
        resolve(event.data)
      }
    }
    worker.addEventListener('message', onLoaded)
  })
}

export const postWorkerCommand = async (
  worker: Worker,
  data: Record<string, any>
): Promise<any> => {
  const id = uuidv4()
  data.id = id
  worker.postMessage(data)
  const result = await waitWorkerMessage(worker, id)
  delete result.id
  return result
}

export const copyTextToClipboard = (str: string) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(str).catch(() => {
      fallbackCopyTextToClipboard(str)
    })
    return
  }
  fallbackCopyTextToClipboard(str)
}

const fallbackCopyTextToClipboard = (str: string) => {
  const el = document.createElement('textarea')
  el.value = str
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}

export const parallelize = async <T, R>(
  data: T[],
  fn: (item: T, index: number) => Promise<R> | R,
  maxParallel = 8
): Promise<R[]> => {
  const results: R[] = []
  const promises: Array<Promise<R> | R> = []
  let i = 0

  while (i < data.length) {
    promises.push(fn(data[i], i))
    if (promises.length >= maxParallel) {
      results.push(...(await Promise.all(promises)))
      promises.length = 0
    }
    i++
  }
  results.push(...(await Promise.all(promises)))

  return results
}
