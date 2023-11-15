import { TimeOutError } from './time-out-after'
import { Waiter } from './waiter'

describe('Waiter', () => {
  describe("it will time out if promise doesn't resolve in time", () => {
    it.each([100, 50, 10])('for %dms', async (ms) => {
      const errorMessage = 'Time out: ' + Math.random().toString()
      const waiter = new Waiter(errorMessage)

      setTimeout(
        () => {
          waiter.done()
        },
        // We always finish 10ms after the waiter should wait for.
        ms + 10
      )

      await expect(() => waiter.wait(ms)).rejects.toThrowError(errorMessage)
      await expect(() => waiter.wait(ms)).rejects.toThrowError(TimeOutError)
    })
  })

  describe('will not throw if the promise resolves in time', () => {
    it.each([100, 50, 10])('for %dms', async (ms) => {
      const waiter = new Waiter('Time out')

      setTimeout(
        () => {
          waiter.done()
        },
        // We always finish 10ms before the waiter should wait for.
        ms - 10
      )

      await waiter.wait(ms)
    })
  })

  it("should return without waiting if it's already done", async () => {
    const waiter = new Waiter('Time out')
    waiter.done()

    // We use fake timers to ensure that if a timer is created, it never
    // resolves. If this happens, the test will timeout.
    jest.useFakeTimers()

    await waiter.wait(0)
  })
})
