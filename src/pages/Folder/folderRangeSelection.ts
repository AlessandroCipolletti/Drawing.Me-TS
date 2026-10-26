import Params from 'main/Params'
import { getEventCoordX, getEventCoordY } from 'utils/domUtils'
import { getDistanceBetweenTwoPoints } from 'utils/mathUtils'

const RANGE_DRAG_THRESHOLD_PX = 20

export interface FolderRangeSelectionContext {
  getDrawingsContainer: () => HTMLElement | null
  isSelectionMode: () => boolean
  findDrawingCardFromEl: (start: HTMLElement | null) => HTMLElement | null
  onSelectionChanged: () => void
}

export const createFolderRangeSelection = (ctx: FolderRangeSelectionContext) => {
  let anchorIndex: number | null = null
  let lastHoveredIndex: number | null = null
  let rangeDragActive = false
  let suppressNextDrawingClick = false
  let selectionSnapshot = new Set<number>()
  let touchStartX = -1
  let touchStartY = -1

  const getOrderedCards = (): HTMLElement[] => {
    const container = ctx.getDrawingsContainer()
    if (!container) return []
    return [...container.querySelectorAll('.folder__drawing[data-local-id]')] as HTMLElement[]
  }

  const indicesSelectedNow = (cards: HTMLElement[]): Set<number> => {
    const selected = new Set<number>()
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].classList.contains('folder__drawing-selected')) {
        selected.add(i)
      }
    }
    return selected
  }

  const applyUnionPreview = (anchor: number, end: number) => {
    const cards = getOrderedCards()
    if (!cards.length) return
    const lo = Math.min(anchor, end)
    const hi = Math.max(anchor, end)
    for (let i = 0; i < cards.length; i++) {
      const inSnapshot = selectionSnapshot.has(i)
      const inRange = i >= lo && i <= hi
      cards[i].classList.toggle('folder__drawing-selected', inSnapshot || inRange)
    }
  }

  const cardAtClientPoint = (x: number, y: number): HTMLElement | null => {
    const hit = document.elementFromPoint(x, y) as HTMLElement | null
    return ctx.findDrawingCardFromEl(hit)
  }

  const indexOfCard = (card: HTMLElement, cards: HTMLElement[]): number => cards.indexOf(card)

  const setRangeDragContainerClass = (active: boolean) => {
    ctx.getDrawingsContainer()?.classList.toggle('folder__drawings-container--range-drag', active)
  }

  const resetSession = () => {
    anchorIndex = null
    lastHoveredIndex = null
    rangeDragActive = false
    selectionSnapshot = new Set()
    touchStartX = touchStartY = -1
    setRangeDragContainerClass(false)
    document.removeEventListener(Params.eventMove, onPointerMove)
    document.removeEventListener(Params.eventEnd, onPointerEnd)
    if (Params.eventCanceled) {
      document.removeEventListener(Params.eventCanceled, resetSession)
    }
  }

  const onPointerMove = (e: Event) => {
    if (anchorIndex === null) return
    const moveX = getEventCoordX(e as any, 0)
    const moveY = getEventCoordY(e as any, 0)
    const distance = getDistanceBetweenTwoPoints(touchStartX, touchStartY, moveX, moveY)

    if (!rangeDragActive && Math.abs(distance) >= RANGE_DRAG_THRESHOLD_PX) {
      rangeDragActive = true
      setRangeDragContainerClass(true)
    }

    if (!rangeDragActive) return

    const cards = getOrderedCards()
    const card = cardAtClientPoint(moveX, moveY)
    if (card) {
      const idx = indexOfCard(card, cards)
      if (idx >= 0) {
        lastHoveredIndex = idx
      }
    }

    const endIndex = lastHoveredIndex ?? anchorIndex
    applyUnionPreview(anchorIndex, endIndex)
  }

  const onPointerEnd = (e: Event) => {
    if (anchorIndex === null) {
      resetSession()
      return
    }

    if (rangeDragActive) {
      const endX = getEventCoordX(e as any, 0)
      const endY = getEventCoordY(e as any, 0)
      const cards = getOrderedCards()
      const endCard = cardAtClientPoint(endX, endY)
      if (endCard) {
        const idx = indexOfCard(endCard, cards)
        if (idx >= 0) {
          lastHoveredIndex = idx
        }
      }
      const endIndex = lastHoveredIndex ?? anchorIndex
      applyUnionPreview(anchorIndex, endIndex)
      suppressNextDrawingClick = true
      ctx.onSelectionChanged()
    }

    resetSession()
  }

  const onContainerPointerDownCapture = (e: Event) => {
    if (!ctx.isSelectionMode()) return
    const ev = e as PointerEvent & { touches?: TouchList }
    if ((typeof ev.button === 'number' && ev.button > 0) || (ev.touches && ev.touches.length > 1)) {
      return
    }

    const target = e.target as HTMLElement | null
    const card = ctx.findDrawingCardFromEl(target)
    if (!card) return

    const cards = getOrderedCards()
    const idx = indexOfCard(card, cards)
    if (idx < 0) return

    resetSession()
    anchorIndex = idx
    lastHoveredIndex = idx
    selectionSnapshot = indicesSelectedNow(cards)
    touchStartX = getEventCoordX(ev, 0)
    touchStartY = getEventCoordY(ev, 0)

    document.addEventListener(Params.eventMove, onPointerMove)
    document.addEventListener(Params.eventEnd, onPointerEnd)
    if (Params.eventCanceled) {
      document.addEventListener(Params.eventCanceled, resetSession)
    }
  }

  const attach = (drawingsContainer: HTMLElement) => {
    drawingsContainer.addEventListener(Params.eventStart, onContainerPointerDownCapture, true)
  }

  const detach = (drawingsContainer: HTMLElement) => {
    drawingsContainer.removeEventListener(Params.eventStart, onContainerPointerDownCapture, true)
    resetSession()
  }

  const shouldScrollOnDrag = (): boolean => anchorIndex === null

  const consumeSuppressClick = (): boolean => {
    if (!suppressNextDrawingClick) return false
    suppressNextDrawingClick = false
    return true
  }

  const cancelForModeExit = () => {
    resetSession()
    suppressNextDrawingClick = false
  }

  return {
    attach,
    detach,
    shouldScrollOnDrag,
    consumeSuppressClick,
    cancelForModeExit,
  }
}
