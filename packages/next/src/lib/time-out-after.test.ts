import { timeOutAfter } from './time-out-after'

describe('timeOutAfter', () => {
  describe('will time out if the promise does not resolve in time', () => {
    it.each([100, 50, 10])('for %dms', async (ms) => {
      const promise = new Promise<void>((resolve) => setTimeout(resolve, ms))

      await expect(() =>
        timeOutAfter(promise, { timeoutAfterMs: ms - 10 })
      ).rejects.toThrow()
    })
  })

  describe('will not throw if the promise resolves in time', () => {
    it.each([100, 50, 10])('for %dms', async (ms) => {
      const promise = new Promise<string>((resolve) =>
        setTimeout(() => resolve('resolved'), ms - 10)
      )

      expect(await timeOutAfter(promise, { timeoutAfterMs: ms })).toEqual(
        'resolved'
      )
    })
  })
})
