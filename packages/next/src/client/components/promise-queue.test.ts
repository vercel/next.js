import { PromiseQueue } from './promise-queue'

describe('PromiseQueue', () => {
  it('should limit the number of concurrent promises', async () => {
    const queue = new PromiseQueue(2)
    const results: number[] = []

    const promises = Array.from({ length: 5 }, (_, i) =>
      queue.enqueue(async () => {
        results.push(i)
        await new Promise((resolve) => setTimeout(resolve, 100))
        return i
      })
    )

    const resolved = await Promise.all(promises)

    expect(resolved).toEqual([0, 1, 2, 3, 4])
    expect(results).toEqual([0, 1, 2, 3, 4])
  })
  it('should allow bumping a promise to be next in the queue', async () => {
    const queue = new PromiseQueue(2)
    const results: number[] = []

    const promises = Array.from({ length: 5 }, (_, i) =>
      queue.enqueue(async () => {
        results.push(i)
        await new Promise((resolve) => setTimeout(resolve, 100))
        return i
      })
    )

    queue.bump(promises[3])

    const resolved = await Promise.all(promises)

    // 3 was bumped to be next in the queue but did not cancel the other promises before it
    expect(results).toEqual([0, 1, 3, 2, 4])
    expect(resolved).toEqual([0, 1, 2, 3, 4])
  })
})
