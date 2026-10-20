const tau = 2 * Math.PI

const easeElasticIn = (t: number): number => {
  const a = 1
  const p = 0.3
  const s = Math.asin(1 / a) * (p / tau)
  t = +t - 1
  return -(a * Math.pow(2, 10 * t) * Math.sin((t - s) * (tau / p)))
}

const easeElasticOut = (t: number): number => {
  const a = 1
  const p = 0.3
  const s = Math.asin(1 / a) * (p / tau)
  return 1 - a * Math.pow(2, -10 * (t = +t)) * Math.sin((t + s) * (tau / p))
}

const b1 = 4 / 11
const b2 = 6 / 11
const b3 = 8 / 11
const b4 = 3 / 4
const b5 = 9 / 11
const b6 = 10 / 11
const b7 = 15 / 16
const b8 = 21 / 22
const b9 = 63 / 64
const b0 = 1 / b1 / b1

const easeBounceOut = (t: number): number => {
  t = +t
  return t < b1
    ? b0 * t * t
    : t < b3
      ? b0 * (t -= b2) * t + b4
      : t < b6
        ? b0 * (t -= b5) * t + b7
        : b0 * (t -= b8) * t + b9
}

class Segment {
  path: SVGPathElement
  length: number
  begin: number
  end: number
  timer: ReturnType<typeof setTimeout> | null = null
  rafId: number | null = null

  constructor(path: SVGPathElement, begin?: number | string, end?: number | string) {
    this.path = path
    this.length = path.getTotalLength()
    this.path.style.strokeDashoffset = `${this.length * 2}`
    this.begin = begin !== undefined ? this.valueOf(begin) : 0
    this.end = end !== undefined ? this.valueOf(end) : this.length
    this.stroke()
  }

  valueOf(input: number | string): number {
    let val = parseFloat(String(input))
    if (typeof input === 'string') {
      if (~input.indexOf('%')) {
        let arr: string[]
        if (~input.indexOf('+')) {
          arr = input.split('+')
          val = this.percent(arr[0]) + parseFloat(arr[1])
        } else if (~input.indexOf('-')) {
          arr = input.split('-')
          val = arr[0] ? this.percent(arr[0]) - parseFloat(arr[1]) : -this.percent(arr[1])
        } else {
          val = this.percent(input)
        }
      }
    }
    return val
  }

  percent(value: string): number {
    return (parseFloat(value) / 100) * this.length
  }

  stroke() {
    this.path.style.strokeDasharray = this.strokeDasharray(this.begin, this.end)
  }

  strokeDasharray(begin: number, end: number): string {
    this.begin = this.valueOf(begin)
    this.end = this.valueOf(end)
    if (this.begin > this.end) {
      const tmp = this.begin
      this.begin = this.end
      this.end = tmp
    }
    if (this.end > this.length) {
      const plus = this.end - this.length
      return [this.length, this.length, plus, this.begin - plus, this.end - this.begin].join(' ')
    }
    if (this.begin < 0) {
      const minus = this.length + this.begin
      if (this.end < 0) {
        return [
          this.length,
          this.length + this.begin,
          this.end - this.begin,
          minus - this.end,
          this.end - this.begin,
          this.length,
        ].join(' ')
      } else {
        return [
          this.length,
          this.length + this.begin,
          this.end - this.begin,
          minus - this.end,
          this.length,
        ].join(' ')
      }
    }
    return [this.length, this.length + this.begin, this.end - this.begin].join(' ')
  }

  draw(
    newBegin: number | string,
    newEnd: number | string,
    duration = 0,
    options: { delay?: number; easing?: (t: number) => number; callback?: () => void } = {}
  ) {
    this.stop()
    const delaySec = options.delay || 0
    const easing = options.easing || ((t: number) => t)
    const callback = options.callback

    if (delaySec > 0) {
      this.timer = setTimeout(() => {
        this.timer = null
        this.draw(newBegin, newEnd, duration, { easing, callback })
      }, delaySec * 1000)
      return
    }

    const startTime = performance.now()
    const initBegin = this.begin
    const initEnd = this.end
    const finalBegin = this.valueOf(newBegin)
    const finalEnd = this.valueOf(newEnd)

    if (duration <= 0) {
      this.path.style.strokeDasharray = this.strokeDasharray(finalBegin, finalEnd)
      if (callback) callback()
      return
    }

    const step = (now: number) => {
      const elapsed = (now - startTime) / 1000
      const progress = Math.min(elapsed / duration, 1)
      const factor = easing(progress)
      const curBegin = initBegin + (finalBegin - initBegin) * factor
      const curEnd = initEnd + (finalEnd - initEnd) * factor
      this.path.style.strokeDasharray = this.strokeDasharray(curBegin, curEnd)
      if (progress < 1) {
        this.rafId = requestAnimationFrame(step)
      } else {
        this.rafId = null
        if (callback) callback()
      }
    }

    this.rafId = requestAnimationFrame(step)
  }

  stop() {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
}

const beginAC = 80
const endAC = 320
const beginB = 80
const endB = 320

const inAC = (s: Segment) => {
  s.draw('80% - 240', '80%', 0.3, {
    delay: 0.1,
    callback: () => inAC2(s),
  })
}

const inAC2 = (s: Segment) => {
  s.draw('100% - 545', '100% - 305', 0.6, {
    easing: easeElasticOut,
  })
}

const inB = (s: Segment) => {
  s.draw(beginB - 60, endB + 60, 0.1, {
    callback: () => inB2(s),
  })
}

const inB2 = (s: Segment) => {
  s.draw(beginB + 120, endB - 120, 0.3, {
    easing: easeBounceOut,
  })
}

const outAC = (s: Segment) => {
  s.draw('90% - 240', '90%', 0.1, {
    easing: easeElasticIn,
    callback: () => outAC2(s),
  })
}

const outAC2 = (s: Segment) => {
  s.draw('20% - 240', '20%', 0.3, {
    callback: () => outAC3(s),
  })
}

const outAC3 = (s: Segment) => {
  s.draw(beginAC, endAC, 0.7, {
    easing: easeElasticOut,
  })
}

const outB = (s: Segment) => {
  s.draw(beginB, endB, 0.7, {
    delay: 0.1,
    easing: easeElasticOut,
  })
}

export const initBurgerButton = (dom: HTMLElement) => {
  let isOpen = false
  const pathA = dom.querySelector('#pathA') as SVGPathElement
  const pathB = dom.querySelector('#pathB') as SVGPathElement
  const pathC = dom.querySelector('#pathC') as SVGPathElement
  const segmentD = new Segment(pathA, beginAC, endAC)
  const segmentE = new Segment(pathB, beginB, endB)
  const segmentF = new Segment(pathC, beginAC, endAC)

  const open = () => {
    isOpen = true
    inAC(segmentD)
    inB(segmentE)
    inAC(segmentF)
  }
  const close = () => {
    isOpen = false
    outAC(segmentD)
    outB(segmentE)
    outAC(segmentF)
  }
  const toggle = () => {
    if (isOpen) {
      close()
    } else {
      open()
    }
  }

  dom.classList.remove('displayNone')

  return {
    open,
    close,
    toggle,
  }
}
