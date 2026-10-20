import { timing } from 'main/Theme'
import { iterateFn } from 'utils/jsUtils'

const animationsKeyframes = {
  fadeIn: (maxFadeIn = 1): Keyframe[] => [
    { opacity: 0, offset: 0 },
    { opacity: maxFadeIn, offset: 1 },
  ],
  fadeOut: (maxFadeIn = 1): Keyframe[] => [
    { opacity: maxFadeIn, offset: 0 },
    { opacity: 0, offset: 1 },
  ],
}

const elementHasAnimation = (el: any, animName: string): boolean =>
  el?.animationsInProgress
    ? Object.prototype.hasOwnProperty.call(el.animationsInProgress, animName)
    : false

export const cancelElementAnimationIfExists = (el: any, animName: string) => {
  if (elementHasAnimation(el, animName)) {
    el.animationsInProgress[animName].onfinish = undefined
    el.animationsInProgress[animName].cancel()
    delete el.animationsInProgress[animName]
  }
}

const fadeInEl = async (el: any, duration: number, maxFadeIn: number, commitResult = true) => {
  if (el instanceof HTMLElement) {
    cancelElementAnimationIfExists(el, 'fadeOut')
    if (!elementHasAnimation(el, 'fadeIn') && el.classList.contains('displayNone')) {
      el.classList.remove('displayNone')
      await animateElement(
        el,
        'fadeIn',
        animationsKeyframes.fadeIn(maxFadeIn),
        duration,
        {},
        commitResult
      )
    }
  }
}

const fadeOutEl = async (el: any, duration: number, maxFadeIn: number, commitResult = true) => {
  if (el instanceof HTMLElement) {
    cancelElementAnimationIfExists(el, 'fadeIn')
    if (!elementHasAnimation(el, 'fadeOut') && !el.classList.contains('displayNone')) {
      const res = await animateElement(
        el,
        'fadeOut',
        animationsKeyframes.fadeOut(maxFadeIn),
        duration,
        {},
        commitResult
      )
      if (res) {
        el.classList.add('displayNone')
      }
    }
  }
}

export const fadeInElements = async (
  els: any,
  { duration = parseInt(timing.FADE_TRANSITION, 10), maxFadeIn = 1, commitResult = true } = {}
) => {
  await iterateFn(els, fadeInEl, [duration, maxFadeIn, commitResult])
}

export const fadeOutElements = async (
  els: any,
  { duration = parseInt(timing.FADE_TRANSITION, 10), maxFadeIn = 1, commitResult = true } = {}
) => {
  await iterateFn(els, fadeOutEl, [duration, maxFadeIn, commitResult])
}

export const animateElement = async (
  el: any,
  name: string,
  keyframes: Keyframe[] = [],
  duration = 200,
  options: KeyframeAnimationOptions = {},
  commitResult = true
): Promise<boolean | undefined> => {
  if (el instanceof HTMLElement && name && typeof name === 'string' && keyframes.length) {
    const fullOptions: KeyframeAnimationOptions = {
      duration,
      fill: 'both',
      ...options,
    }
    return await new Promise<boolean>((resolve) => {
      const anim = el.animate(keyframes, fullOptions)
      const anyEl = el as any
      anyEl.animationsInProgress = anyEl.animationsInProgress || {}
      anyEl.animationsInProgress[name] = anim
      anim.onfinish = () => {
        delete anyEl.animationsInProgress[name]
        if (commitResult) {
          try {
            anim.commitStyles()
          } catch (e) {
            console.error(e)
          }
        }
        anim.cancel()
        resolve(true)
      }
    })
  }
}

export const addInElement = async (
  el: HTMLElement,
  { duration = parseInt(timing.FADE_TRANSITION, 10), commitResult = true } = {}
) => {
  el.classList.add('displayNone')
  animateElement(
    el,
    'addIn',
    [{ width: '0px', height: '0px', marginTop: '0px', offset: 0 }],
    duration,
    { easing: 'ease-in-out' },
    commitResult
  )
  await fadeInElements(el, { duration, commitResult })
  cancelElementAnimationIfExists(el, 'addIn')
}

export const removeOutElement = async (
  el: HTMLElement,
  { duration = parseInt(timing.FADE_TRANSITION, 10), commitResult = true } = {}
) => {
  animateElement(
    el,
    'removeOut',
    [{ width: '0px', height: '0px', marginTop: '0px', offset: 1 }],
    duration,
    { easing: 'ease-in-out' },
    commitResult
  )
  await fadeOutElements(el, { duration, commitResult })
  cancelElementAnimationIfExists(el, 'removeOut')
  el.remove()
}
