import Params from 'main/Params'
import { preventDefault } from 'utils/domUtils'
import { isValidQuad, QuadCorners, WarpMesh } from 'utils/imageWarp'
import { TransformKind } from './editorTypes'
import { applyPerspectiveCornerDrag } from './resizeTransformSession'

type TouchCoords = (e: Event) => [number, number]
type SnapLayerPoint = (x: number, y: number) => [number, number]

/**
 * Latest-only move gate: while a paint frame is pending, incoming moves only
 * replace the stored coordinates. The newest one is applied after that frame,
 * so stale mousemoves never queue up behind slow warp paints.
 */
const createLatestMoveGate = (apply: (x: number, y: number) => void) => {
  let busy = false
  let pending: [number, number] | null = null
  let rafId: number | null = null
  const push = (x: number, y: number) => {
    if (busy) {
      pending = [x, y]
      return
    }
    busy = true
    apply(x, y)
    // Registered after the paint RAF scheduled by apply(), so it runs after the paint.
    rafId = requestAnimationFrame(() => {
      rafId = null
      busy = false
      if (pending) {
        const [px, py] = pending
        pending = null
        push(px, py)
      }
    })
  }
  const flush = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    busy = false
    if (pending) {
      const [px, py] = pending
      pending = null
      apply(px, py)
    }
  }
  const cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    busy = false
    pending = null
  }
  return { push, flush, cancel }
}

export const addQuadCornerHandlers = (
  corners: HTMLElement[],
  getQuad: () => QuadCorners,
  getTouchCoords: TouchCoords,
  onStart: () => void,
  onChange: (quad: QuadCorners) => void,
  onEnd: () => void,
  kind: () => TransformKind,
  snapLayerPoint?: SnapLayerPoint
) => {
  let initialQuad: QuadCorners | null = null
  let onTouchMove: ((e: Event) => void) | null = null
  let activeIndex = -1

  const gate = createLatestMoveGate((tx: number, ty: number) => {
    if (!initialQuad || activeIndex < 0) return
    const base = initialQuad
    let next: QuadCorners
    if (kind() === 'perspective') {
      next = applyPerspectiveCornerDrag(base, activeIndex, { x: tx, y: ty })
    } else {
      next = base.map((p, i) => (i === activeIndex ? { x: tx, y: ty } : { ...p })) as QuadCorners
    }
    if (!isValidQuad(next)) return
    onChange(next)
  })

  const onTouchEnd = (e: Event) => {
    preventDefault(e)
    gate.flush()
    onEnd()
    if (onTouchMove) {
      document.removeEventListener(Params.eventMove, onTouchMove)
      document.removeEventListener(Params.eventEnd, onTouchEnd)
    }
    initialQuad = null
    onTouchMove = null
    activeIndex = -1
  }

  corners.forEach((el, index) => {
    el.addEventListener(Params.eventStart, (e) => {
      const kindVal = kind()
      if (kindVal !== 'distort' && kindVal !== 'perspective') return
      preventDefault(e)
      onStart()
      const currentQuad = getQuad()
      if (!currentQuad) return
      initialQuad = currentQuad.map((p) => ({ ...p })) as QuadCorners
      activeIndex = index
      onTouchMove = (moveEvent) => {
        preventDefault(moveEvent)
        if (!initialQuad || activeIndex < 0) return
        let [tx, ty] = getTouchCoords(moveEvent)
        if (snapLayerPoint) {
          ;[tx, ty] = snapLayerPoint(tx, ty)
        }
        gate.push(tx, ty)
      }
      document.addEventListener(Params.eventMove, onTouchMove)
      document.addEventListener(Params.eventEnd, onTouchEnd)
    })
  })
}

export const addWarpMeshHandlers = (
  bullets: Array<HTMLElement | null>,
  getMesh: () => WarpMesh,
  getTouchCoords: TouchCoords,
  onStart: () => void,
  onChange: (mesh: WarpMesh) => void,
  onEnd: () => void,
  isWarpMode: () => boolean,
  snapLayerPoint?: SnapLayerPoint
) => {
  let initialMesh: WarpMesh | null = null
  let onTouchMove: ((e: Event) => void) | null = null
  let activeIndex = -1

  const gate = createLatestMoveGate((tx: number, ty: number) => {
    if (!initialMesh || activeIndex < 0) return
    const next: WarpMesh = {
      cols: initialMesh.cols,
      rows: initialMesh.rows,
      points: initialMesh.points.map((p, i) => (i === activeIndex ? { x: tx, y: ty } : { ...p })),
    }
    onChange(next)
  })

  const onTouchEnd = (e: Event) => {
    preventDefault(e)
    gate.flush()
    onEnd()
    if (onTouchMove) {
      document.removeEventListener(Params.eventMove, onTouchMove)
      document.removeEventListener(Params.eventEnd, onTouchEnd)
    }
    initialMesh = null
    onTouchMove = null
    activeIndex = -1
  }

  bullets.forEach((el, index) => {
    if (!el) return
    el.addEventListener(Params.eventStart, (e) => {
      if (!isWarpMode()) return
      preventDefault(e)
      onStart()
      const mesh = getMesh()
      if (!mesh) return
      initialMesh = {
        cols: mesh.cols,
        rows: mesh.rows,
        points: mesh.points.map((p) => ({ ...p })),
      }
      activeIndex = index
      onTouchMove = (moveEvent) => {
        preventDefault(moveEvent)
        if (!initialMesh || activeIndex < 0) return
        let [tx, ty] = getTouchCoords(moveEvent)
        if (snapLayerPoint) {
          ;[tx, ty] = snapLayerPoint(tx, ty)
        }
        gate.push(tx, ty)
      }
      document.addEventListener(Params.eventMove, onTouchMove)
      document.addEventListener(Params.eventEnd, onTouchEnd)
    })
  })
}
