/**
 * @jest-environment node
 */

import { AsyncLocalStorage } from 'async_hooks'
import { runInNewContext } from 'node:vm'
import { setFlagsFromString } from 'node:v8'
import { InvariantError } from '../../shared/lib/invariant-error'
import { AwaiterMulti, AwaiterOnce } from './awaiter'

setFlagsFromString('--expose-gc')
const forceGarbageCollection = runInNewContext('gc') as () => void

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

describe('AwaiterMulti/AwaiterOnce retention', () => {
  // Install AsyncLocalStorage before importing the module that captures the snapshot.
  type AwaiterMod = typeof import('./awaiter')
  let Awaiters: AwaiterMod

  beforeAll(async () => {
    // @ts-expect-error
    globalThis.AsyncLocalStorage = AsyncLocalStorage
    jest.resetModules()
    Awaiters = await import('./awaiter')
  })

  describe.each(['AwaiterMulti', 'AwaiterOnce'] as const)('%s', (implName) => {
    it('does not retain the async context of a task that never settles', async () => {
      const awaiter = new Awaiters[implName]({ onError: () => {} })

      const requestStoreRef = await runInRequestContext(() => {
        awaiter.waitUntil(new Promise<void>(() => {}))
      })

      await expectCollected(requestStoreRef)
    })

    it('does not retain the async context of a task that settles', async () => {
      const awaiter = new Awaiters[implName]({ onError: () => {} })

      const requestStoreRef = await runInRequestContext(() => {
        awaiter.waitUntil(Promise.resolve())
      })

      await expectCollected(requestStoreRef)
    })
  })
})

async function runInRequestContext(
  callback: () => void
): Promise<WeakRef<object>> {
  const requestStorage = new AsyncLocalStorage<object>()
  let requestStoreRef: WeakRef<object> | undefined

  await requestStorage.run({ requestId: 'request' }, async () => {
    const requestStore = requestStorage.getStore()

    if (!requestStore) {
      throw new Error('Expected a request store')
    }

    requestStoreRef = new WeakRef(requestStore)
    callback()
  })

  if (!requestStoreRef) {
    throw new Error('Expected a request store reference')
  }

  return requestStoreRef
}

async function expectCollected(ref: WeakRef<object>): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    forceGarbageCollection()
    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  expect(ref.deref()).toBeUndefined()
}

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
