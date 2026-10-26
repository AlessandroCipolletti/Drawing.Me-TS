import { noop } from 'utils/jsUtils'

const DEFAULT_MAX_HISTORY_LENGHT = 10

class History<T = any> {
  #data: T[] = []
  #pointer = -1
  #onDeleteHandler: (item: T) => void = () => {}
  maxLength: number

  constructor(maxLength = DEFAULT_MAX_HISTORY_LENGHT, deleteHandler: (item: T) => void = noop) {
    this.maxLength = maxLength
    this.#onDeleteHandler = deleteHandler
  }

  add(value: T): T[] | undefined {
    if (typeof value !== 'undefined') {
      const deletedItems: T[] = []
      if (this.#data.length === 0 || value !== this.#data[this.#pointer]) {
        deletedItems.push(...this.#data.splice(this.#pointer + 1, this.#data.length))
        this.#data.push(value)
        if (this.#data.length > this.maxLength) {
          deletedItems.push(...this.#data.splice(0, this.#data.length - this.maxLength))
        }
        this.#pointer = this.#data.length - 1
      }
      deletedItems.forEach(this.#onDeleteHandler)
      return deletedItems
    }
  }

  getCurrent(): T | undefined {
    return this.#data[this.#pointer]
  }

  getPrevious(): T | undefined {
    return this.#pointer > 0 ? this.#data[this.#pointer - 1] : undefined
  }

  replaceCurrent(value: T) {
    if (typeof value === 'undefined') return
    if (this.#pointer >= 0 && this.#pointer < this.#data.length) {
      const prev = this.#data[this.#pointer]
      if (prev !== value) {
        this.#onDeleteHandler(prev)
        this.#data[this.#pointer] = value
      }
    } else {
      this.add(value)
    }
  }

  back(): T | undefined {
    if (this.canGoBack) {
      this.#pointer = Math.max(0, this.#pointer - 1)
      return this.getCurrent()
    }
  }

  forward(): T | undefined {
    if (this.canGoForward) {
      this.#pointer = Math.min(this.#data.length - 1, this.#pointer + 1)
      return this.getCurrent()
    }
  }

  deleteFarest(): T | false {
    if (this.#data.length >= 1) {
      this.#pointer = Math.max(0, this.#pointer - 1)
      const deletedItem = this.#data.splice(0, 1)[0]
      this.#onDeleteHandler(deletedItem)
      return deletedItem
    }
    return false
  }

  deleteNewest(): T | false {
    if (this.#data.length >= 1) {
      this.#pointer = Math.min(this.#pointer, this.#data.length - 2)
      const deletedItem = this.#data.pop()!
      this.#onDeleteHandler(deletedItem)
      return deletedItem
    }
    return false
  }

  filterBackwards(filterFn: (item: T) => boolean) {
    if (typeof filterFn === 'function') {
      this.filter((e, index) => index > this.#pointer || filterFn(e))
    }
  }

  filterForwards(filterFn: (item: T) => boolean) {
    if (typeof filterFn === 'function') {
      this.filter((e, index) => index <= this.#pointer || filterFn(e))
    }
  }

  filter(filterFn: (item: T, index: number) => boolean): T[] | undefined {
    if (typeof filterFn === 'function') {
      const deletedData: T[] = []
      const keptData: T[] = []
      let newPointer = -1

      for (let i = 0; i < this.#data.length; i++) {
        const item = this.#data[i]
        if (filterFn(item, i)) {
          if (i <= this.#pointer) {
            newPointer = keptData.length
          }
          keptData.push(item)
        } else {
          deletedData.push(item)
        }
      }

      this.#pointer = newPointer
      deletedData.forEach(this.#onDeleteHandler)
      this.#data = keptData
      return deletedData
    }
  }

  clear() {
    this.#data.forEach(this.#onDeleteHandler)
    this.#data = []
    this.#pointer = -1
  }

  getAllData(): T[] {
    return this.#data
  }

  onDelete(handler: (item: T) => void) {
    if (typeof handler === 'function') {
      this.#onDeleteHandler = handler
    }
  }

  log() {
    console.log('History - #pointer: ', this.#pointer, '#data: ', this.#data.length)
  }

  get canGoBack(): boolean {
    return this.#pointer > 0
  }

  get canGoForward(): boolean {
    return this.#pointer < this.#data.length - 1
  }

  get currentSize(): number {
    return this.#data.length
  }

  get currentIndex(): number {
    return this.#pointer + 1
  }

  get maxSize(): number {
    return this.maxLength
  }

  get isFull(): boolean {
    return this.#data.length >= this.maxLength
  }
}

export default History
