import { mapWithConcurrency } from './map-with-concurrency'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('mapWithConcurrency', () => {
  it('returns results in input order', async () => {
    const results = await mapWithConcurrency([30, 10, 20, 0], 2, async (ms) => {
      await sleep(ms)
      return ms
    })
    expect(results).toEqual([30, 10, 20, 0])
  })

  it('never runs more than `limit` calls at once', async () => {
    let running = 0
    let maxRunning = 0
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      3,
      async (i) => {
        running++
        maxRunning = Math.max(maxRunning, running)
        await sleep(i % 4)
        running--
      }
    )
    expect(maxRunning).toBe(3)
  })

  it('starts the next item as soon as any item finishes', async () => {
    const started: number[] = []
    // Item 0 is slow. With fixed groups of two, item 2 would wait for it.
    await mapWithConcurrency([0, 1, 2, 3], 2, async (i) => {
      started.push(i)
      await sleep(i === 0 ? 50 : 1)
    })
    expect(started).toEqual([0, 1, 2, 3])
  })

  it('does not wait for a slow item before starting later items', async () => {
    const order: number[] = []
    await mapWithConcurrency([0, 1, 2, 3], 2, async (i) => {
      await sleep(i === 0 ? 40 : 5)
      order.push(i)
    })
    expect(order).toEqual([1, 2, 3, 0])
  })

  it('rejects with the first error and stops starting new items', async () => {
    const started: number[] = []
    await expect(
      mapWithConcurrency([0, 1, 2, 3, 4], 1, async (i) => {
        started.push(i)
        if (i === 1) throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    expect(started).toEqual([0, 1])
  })

  it('handles empty input and limits larger than the input', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])
    expect(await mapWithConcurrency([1, 2], 100, async (x) => x * 2)).toEqual([
      2, 4,
    ])
  })
})
