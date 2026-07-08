import { DetachedPromise } from './detached-promise'
import { runWithConcurrency } from './run-with-concurrency'

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

  it('stops starting new items after a worker rejects', async () => {
    const firstItemGate = new DetachedPromise<void>()
    const started: number[] = []
    const error = new Error('unexpected failure')

    const result = runWithConcurrency([0, 1, 2], 2, async (item) => {
      started.push(item)

      if (item === 0) {
        await firstItemGate.promise
      } else if (item === 1) {
        throw error
      }

      return item
    })

    await expect(result).rejects.toBe(error)
    expect(started).toEqual([0, 1])

    firstItemGate.resolve()
    await waitForNextTurn()
    expect(started).toEqual([0, 1])
  })

  it('rejects invalid maxConcurrency values', async () => {
    const worker = jest.fn(async (item: number) => item)

    await expect(runWithConcurrency([0, 1], 0, worker)).rejects.toThrow(
      'maxConcurrency must be a positive integer'
    )
    expect(worker).not.toHaveBeenCalled()
  })
})
