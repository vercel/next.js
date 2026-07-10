import { DetachedPromise } from './detached-promise'
import { runInBatches, runWithConcurrency } from './run-with-concurrency'

const waitForNextTurn = () =>
  new Promise<void>((resolve) => setImmediate(resolve))

describe('runWithConcurrency', () => {
  it('starts the next item as soon as a worker is available', async () => {
    const gates = Array.from({ length: 4 }, () => new DetachedPromise<void>())
    const started: number[] = []

    const result = runWithConcurrency([0, 1, 2, 3], 2, async (item) => {
      started.push(item)
      await gates[item].promise
      return `result ${item}`
    })

    expect(started).toEqual([0, 1])

    gates[1].resolve()
    await waitForNextTurn()
    expect(started).toEqual([0, 1, 2])

    gates[2].resolve()
    await waitForNextTurn()
    expect(started).toEqual([0, 1, 2, 3])

    gates[3].resolve()
    gates[0].resolve()

    await expect(result).resolves.toEqual([
      'result 0',
      'result 1',
      'result 2',
      'result 3',
    ])
  })

  it('stops starting new items after a worker rejects and waits for in-flight items', async () => {
    const firstItemGate = new DetachedPromise<void>()
    const started: number[] = []
    const finished: number[] = []
    const error = new Error('unexpected failure')

    const result = runWithConcurrency([0, 1, 2], 2, async (item) => {
      started.push(item)

      if (item === 0) {
        await firstItemGate.promise
      } else if (item === 1) {
        throw error
      }

      finished.push(item)
      return item
    })

    let settled = false
    result.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )

    await waitForNextTurn()
    expect(started).toEqual([0, 1])
    // Item 0 is still running, so the returned promise must not settle yet.
    expect(settled).toBe(false)

    firstItemGate.resolve()
    await expect(result).rejects.toBe(error)
    expect(finished).toEqual([0])
    expect(started).toEqual([0, 1])
  })
})

describe('runInBatches', () => {
  it('waits for the whole batch before starting the next one', async () => {
    const gates = Array.from({ length: 4 }, () => new DetachedPromise<void>())
    const started: number[] = []

    const result = runInBatches([0, 1, 2, 3], 2, async (item) => {
      started.push(item)
      await gates[item].promise
      return `result ${item}`
    })

    expect(started).toEqual([0, 1])

    // Unlike rolling concurrency, one finished item does not start the next
    // item while the rest of the batch is still running.
    gates[1].resolve()
    await waitForNextTurn()
    expect(started).toEqual([0, 1])

    gates[0].resolve()
    await waitForNextTurn()
    expect(started).toEqual([0, 1, 2, 3])

    gates[2].resolve()
    gates[3].resolve()

    await expect(result).resolves.toEqual([
      'result 0',
      'result 1',
      'result 2',
      'result 3',
    ])
  })

  it('stops starting new batches after a rejection and waits for in-flight items', async () => {
    const firstItemGate = new DetachedPromise<void>()
    const started: number[] = []
    const finished: number[] = []
    const error = new Error('unexpected failure')

    const result = runInBatches([0, 1, 2], 2, async (item) => {
      started.push(item)

      if (item === 0) {
        await firstItemGate.promise
      } else if (item === 1) {
        throw error
      }

      finished.push(item)
      return item
    })

    let settled = false
    result.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )

    await waitForNextTurn()
    expect(started).toEqual([0, 1])
    // Item 0 is still running, so the returned promise must not settle yet.
    expect(settled).toBe(false)

    firstItemGate.resolve()
    await expect(result).rejects.toBe(error)
    expect(finished).toEqual([0])
    expect(started).toEqual([0, 1])
  })
})

describe.each([
  ['runWithConcurrency', runWithConcurrency],
  ['runInBatches', runInBatches],
] as const)('%s', (_name, run) => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid maxConcurrency value of %p',
    async (maxConcurrency) => {
      const worker = jest.fn(async (item: number) => item)

      await expect(run([0, 1], maxConcurrency, worker)).rejects.toThrow(
        'maxConcurrency must be a positive integer'
      )
      expect(worker).not.toHaveBeenCalled()
    }
  )
})
