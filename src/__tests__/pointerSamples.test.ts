import { describe, expect, it } from 'vitest'
import { filterFreshPointerSamples } from 'utils/pointerEventsUtils/touchEventsUtils'

describe('filterFreshPointerSamples', () => {
  it('keeps a coalesced batch of new pencil points', () => {
    const { fresh } = filterFreshPointerSamples(
      [
        { timeStamp: 10, clientX: 1, clientY: 1 },
        { timeStamp: 14, clientX: 4, clientY: 2 },
      ],
      null
    )
    expect(fresh.map((sample) => sample.timeStamp)).toEqual([10, 14])
  })

  it('drops the same samples when pointermove repeats a pointerrawupdate', () => {
    const first = filterFreshPointerSamples(
      [
        { timeStamp: 10, clientX: 1, clientY: 1 },
        { timeStamp: 14, clientX: 4, clientY: 2 },
      ],
      null
    )
    const second = filterFreshPointerSamples(
      [
        { timeStamp: 10, clientX: 1, clientY: 1 },
        { timeStamp: 14, clientX: 4, clientY: 2 },
        { timeStamp: 18, clientX: 8, clientY: 3 },
      ],
      first.last
    )
    expect(second.fresh.map((sample) => sample.timeStamp)).toEqual([18])
  })

  it('drops a repeated point that has no timestamp', () => {
    const first = filterFreshPointerSamples([{ clientX: 5, clientY: 5 }], null)
    const second = filterFreshPointerSamples([{ clientX: 5, clientY: 5 }], first.last)
    expect(second.fresh).toHaveLength(0)
  })
})
