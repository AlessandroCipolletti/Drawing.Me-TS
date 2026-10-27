import Params from 'main/Params'
import { round } from 'utils/mathUtils'
import type { EditorRefs, EditorState } from 'pages/Editor/editorTypes'
import { guidesState } from './guidesState'
import { getRotationHandleOffset, getSymmetryRayAngles } from './symmetryMath'

let rafId: number | null = null
let fadeClass = ''

export const setGuidesFadeClass = (className: string) => {
  fadeClass = className
}

const ensureOverlaySize = (canvas: HTMLCanvasElement, width: number, height: number) => {
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
}

const handlesVisible = () => guidesState.symmetry !== 'off' && guidesState.showOriginHandle

export const updateGuidesOriginBulletPosition = (refs: EditorRefs) => {
  const anchor = refs.guidesOriginAnchor
  const bullet = refs.guidesOriginBullet
  if (!anchor || !bullet) return
  if (!handlesVisible()) {
    bullet.classList.add('displayNone')
    bullet.style.pointerEvents = 'none'
    return
  }
  bullet.classList.remove('displayNone')
  bullet.style.pointerEvents = ''
  bullet.classList.toggle('editor-guides__origin-bullet--faded', fadeClass === 'faded')
  const rect = anchor.getBoundingClientRect()
  bullet.style.left = `${round(rect.left, 1)}px`
  bullet.style.top = `${round(rect.top, 1)}px`
}

export const updateGuidesRotationBulletPosition = (refs: EditorRefs) => {
  const anchor = refs.guidesRotationAnchor
  const bullet = refs.guidesRotationBullet
  if (!anchor || !bullet) return
  if (!handlesVisible()) {
    bullet.classList.add('displayNone')
    bullet.style.pointerEvents = 'none'
    return
  }
  bullet.classList.remove('displayNone')
  bullet.style.pointerEvents = ''
  bullet.classList.toggle('editor-guides__rotation-bullet--faded', fadeClass === 'faded')
  const rect = anchor.getBoundingClientRect()
  bullet.style.left = `${round(rect.left, 1)}px`
  bullet.style.top = `${round(rect.top, 1)}px`
}

export const renderGuidesOverlay = (state: EditorState, refs: EditorRefs, _liveScale?: number) => {
  const canvas = refs.guidesOverlay
  if (!canvas) return
  const mode = guidesState.symmetry
  if (mode === 'off') {
    canvas.classList.add('displayNone')
    refs.guidesOriginBullet?.classList.add('displayNone')
    refs.guidesRotationBullet?.classList.add('displayNone')
    return
  }
  const cw = state.canvas.width
  const ch = state.canvas.height
  if (cw <= 0 || ch <= 0) return

  canvas.classList.remove('displayNone')
  canvas.classList.toggle('editor-guides__overlay--faded', fadeClass === 'faded')
  ensureOverlaySize(canvas, cw, ch)

  if (refs.guidesOriginAnchor) {
    refs.guidesOriginAnchor.style.left = `${round(guidesState.originX / Params.pxScale, 1)}px`
    refs.guidesOriginAnchor.style.top = `${round(guidesState.originY / Params.pxScale, 1)}px`
  }
  const handleOffset = getRotationHandleOffset(mode, guidesState.rotationRad, Params.pxScale)
  if (refs.guidesRotationAnchor) {
    refs.guidesRotationAnchor.style.left = `${round((guidesState.originX + handleOffset.dx) / Params.pxScale, 1)}px`
    refs.guidesRotationAnchor.style.top = `${round((guidesState.originY + handleOffset.dy) / Params.pxScale, 1)}px`
  }
  updateGuidesOriginBulletPosition(refs)
  updateGuidesRotationBulletPosition(refs)

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, cw, ch)

  const rays = getSymmetryRayAngles(mode, guidesState.rotationRad)
  const { originX, originY } = guidesState
  const reach = Math.hypot(cw, ch) * 2

  const guideGrayDark = '#64748b'
  const guideGrayLight = '#cbd5e1'

  const strokeMirrorRays = (normalOffset: number, color: string) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.beginPath()
    for (const angle of rays) {
      const nx = -Math.sin(angle)
      const ny = Math.cos(angle)
      const ox = originX + nx * normalOffset
      const oy = originY + ny * normalOffset
      const dx = Math.cos(angle)
      const dy = Math.sin(angle)
      if (mode === '2') {
        ctx.moveTo(ox - dx * reach, oy - dy * reach)
        ctx.lineTo(ox + dx * reach, oy + dy * reach)
      } else {
        ctx.moveTo(ox, oy)
        ctx.lineTo(ox + dx * reach, oy + dy * reach)
      }
    }
    ctx.stroke()
  }

  ctx.save()
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  strokeMirrorRays(-0.5, guideGrayDark)
  strokeMirrorRays(0.5, guideGrayLight)
  ctx.restore()
}

export const scheduleGuidesOverlayRedraw = (state: EditorState, refs: EditorRefs) => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    rafId = null
    renderGuidesOverlay(state, refs)
  })
}

export const cancelGuidesOverlayRedraw = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}
