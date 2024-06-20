import { InvariantError } from '../../shared/lib/invariant-error'
import { AwaiterMulti, AwaiterOnce } from './awaiter'

describe('AwaiterOnce/AwaiterMulti', () => {
  describe.each([
    { name: 'AwaiterMulti', impl: AwaiterMulti },
    { name: 'AwaiterOnce', impl: AwaiterOnce },
  ])('$name', ({ impl: AwaiterImpl }) => {
    it('awaits promises added by other promises', async () => {
      const awaiter = new AwaiterImpl()

      const MAX_DEPTH = 5
      const promises: TrackedPromise<unknown>[] = []

      const waitUntil = (promise: Promise<unknown>) => {
        promises.push(trackPromiseSettled(promise))
        awaiter.waitUntil(promise)
      }

      const makeNestedPromise = async () => {
        if (promises.length >= MAX_DEPTH) {
          return
        }
        await sleep(100)
        waitUntil(makeNestedPromise())
      }

      waitUntil(makeNestedPromise())

      await awaiter.awaiting()

      for (const promise of promises) {
        expect(promise.isSettled).toBe(true)
      }
    })

    it('calls onError for rejected promises', async () => {
      const onError = jest.fn<void, [error: unknown]>()
      const awaiter = new AwaiterImpl({ onError })

      awaiter.waitUntil(Promise.reject('error 1'))
      awaiter.waitUntil(
        sleep(100).then(() => awaiter.waitUntil(Promise.reject('error 2')))
      )

      await awaiter.awaiting()

      expect(onError).toHaveBeenCalledWith('error 1')
      expect(onError).toHaveBeenCalledWith('error 2')
    })
  })
})

describe('AwaiterOnce', () => {
  it("does not allow calling waitUntil after it's been awaited", async () => {
    const awaiter = new AwaiterOnce()
    awaiter.waitUntil(Promise.resolve(1))
    await awaiter.awaiting()
    expect(() => awaiter.waitUntil(Promise.resolve(2))).toThrow(InvariantError)
  })
})

type TrackedPromise<T> = Promise<T> & { isSettled: boolean }

function trackPromiseSettled<T>(promise: Promise<T>): TrackedPromise<T> {
  const tracked = promise as TrackedPromise<T>
  tracked.isSettled = false
  tracked.then(
    () => {
      tracked.isSettled = true
    },
    () => {
      tracked.isSettled = true
    }
  )
  return tracked
}

function sleep(duration: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, duration))
}
