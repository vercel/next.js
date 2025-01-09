import { DetachedPromise } from '../../lib/detached-promise'
import { AsyncLocalStorage } from 'async_hooks'

import type { WorkStore } from '../app-render/work-async-storage.external'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'
import type { AfterContext } from './after-context'

describe('AfterContext', () => {
  // 'async-local-storage.ts' needs `AsyncLocalStorage` on `globalThis` at import time,
  // so we have to do some contortions here to set it up before running anything else
  type WASMod = typeof import('../app-render/work-async-storage.external')
  type WSMod = typeof import('../app-render/work-unit-async-storage.external')
  type AfterMod = typeof import('./after')
  type AfterContextMod = typeof import('./after-context')

  let workAsyncStorage: WASMod['workAsyncStorage']
  let workUnitAsyncStorage: WSMod['workUnitAsyncStorage']
  let AfterContext: AfterContextMod['AfterContext']
  let after: AfterMod['after']

  beforeAll(async () => {
    // @ts-expect-error
    globalThis.AsyncLocalStorage = AsyncLocalStorage

    const WASMod = await import('../app-render/work-async-storage.external')
    workAsyncStorage = WASMod.workAsyncStorage

    const WSMod = await import('../app-render/work-unit-async-storage.external')
    workUnitAsyncStorage = WSMod.workUnitAsyncStorage

    const AfterContextMod = await import('./after-context')
    AfterContext = AfterContextMod.AfterContext

    const AfterMod = await import('./after')
    after = AfterMod.after
  })

  const createRun =
    (_afterContext: AfterContext, workStore: WorkStore) =>
    <T>(cb: () => T): T => {
      return workAsyncStorage.run(workStore, () =>
        workUnitAsyncStorage.run(createMockWorkUnitStore(), cb)
      )
    }

  it('runs after() callbacks from a run() callback that resolves', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))

    let onCloseCallback: (() => void) | undefined = undefined
    const onClose = jest.fn((cb) => {
      onCloseCallback = cb
    })

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: undefined,
    })

    const workStore = createMockWorkStore(afterContext)
    const run = createRun(afterContext, workStore)

    // ==================================

    const promise0 = new DetachedPromise<string>()

    const promise1 = new DetachedPromise<string>()
    const afterCallback1 = jest.fn(() => promise1.promise)

    const promise2 = new DetachedPromise<string>()
    const afterCallback2 = jest.fn(() => promise2.promise)

    await run(async () => {
      after(promise0.promise)
      expect(onClose).not.toHaveBeenCalled() // we don't need onClose for bare promises
      expect(waitUntil).toHaveBeenCalledTimes(1)

      await Promise.resolve(null)

      after(afterCallback1)
      expect(waitUntil).toHaveBeenCalledTimes(2) // just runCallbacksOnClose

      await Promise.resolve(null)

      after(afterCallback2)
      expect(waitUntil).toHaveBeenCalledTimes(2) // should only `waitUntil(this.runCallbacksOnClose())` once for all callbacks
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(afterCallback1).not.toHaveBeenCalled()
    expect(afterCallback2).not.toHaveBeenCalled()

    // the response is done.
    onCloseCallback!()
    await Promise.resolve(null)

    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(afterCallback2).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(2)

    promise0.resolve('0')
    promise1.resolve('1')
    promise2.resolve('2')

    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual([
      '0', // promises are passed to waitUntil as is
      undefined, // callbacks all get collected into a big void promise
    ])
  })

  it('runs after() callbacks from a run() callback that throws', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))

    let onCloseCallback: (() => void) | undefined = undefined
    const onClose = jest.fn((cb) => {
      onCloseCallback = cb
    })

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: undefined,
    })

    const workStore = createMockWorkStore(afterContext)

    const run = createRun(afterContext, workStore)

    // ==================================

    const promise1 = new DetachedPromise<string>()
    const afterCallback1 = jest.fn(() => promise1.promise)

    await run(async () => {
      after(afterCallback1)
      throw new Error('boom!')
    }).catch(() => {})

    // runCallbacksOnClose
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)

    expect(afterCallback1).not.toHaveBeenCalled()

    // the response is done.
    onCloseCallback!()
    await Promise.resolve(null)

    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(1)

    promise1.resolve('1')

    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual([undefined])
  })

  it('runs after() callbacks from a run() callback that streams', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))

    let onCloseCallback: (() => void) | undefined = undefined
    const onClose = jest.fn((cb) => {
      onCloseCallback = cb
    })

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: undefined,
    })

    const workStore = createMockWorkStore(afterContext)

    const run = createRun(afterContext, workStore)

    // ==================================

    const promise1 = new DetachedPromise<string>()
    const afterCallback1 = jest.fn(() => promise1.promise)

    const promise2 = new DetachedPromise<string>()
    const afterCallback2 = jest.fn(() => promise2.promise)

    const streamStarted = new DetachedPromise<void>()

    const stream = run(() => {
      return new ReadableStream<string>({
        async start(controller) {
          await streamStarted.promise // block the stream to start it manually later

          const delay = () =>
            new Promise<void>((resolve) => setTimeout(resolve, 50))

          after(afterCallback1)
          controller.enqueue('one')
          await delay()
          expect(waitUntil).toHaveBeenCalledTimes(1) // runCallbacksOnClose

          after(afterCallback2)
          controller.enqueue('two')
          await delay()
          expect(waitUntil).toHaveBeenCalledTimes(1) // runCallbacksOnClose

          await delay()
          controller.close()
        },
      })
    })

    expect(onClose).not.toHaveBeenCalled() // no after()s executed yet
    expect(afterCallback1).not.toHaveBeenCalled()
    expect(afterCallback2).not.toHaveBeenCalled()

    // start the stream and consume it, which'll execute the after()s.
    {
      streamStarted.resolve()
      const reader = stream.getReader()
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) {
          break
        }
      }
    }

    // runCallbacksOnClose
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(1)

    expect(afterCallback1).not.toHaveBeenCalled()
    expect(afterCallback2).not.toHaveBeenCalled()

    // the response is done.
    onCloseCallback!()
    await Promise.resolve(null)

    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(afterCallback2).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(1)

    promise1.resolve('1')
    promise2.resolve('2')

    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual([undefined])
  })

  it('runs after() callbacks added within an after()', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))

    let onCloseCallback: (() => void) | undefined = undefined
    const onClose = jest.fn((cb) => {
      onCloseCallback = cb
    })

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: undefined,
    })

    const workStore = createMockWorkStore(afterContext)
    const run = createRun(afterContext, workStore)

    // ==================================

    const promise1 = new DetachedPromise<string>()
    const afterCallback1 = jest.fn(async () => {
      await promise1.promise
      after(afterCallback2)
    })

    const promise2 = new DetachedPromise<string>()
    const afterCallback2 = jest.fn(() => promise2.promise)

    await run(async () => {
      after(afterCallback1)
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(waitUntil).toHaveBeenCalledTimes(1) // just runCallbacksOnClose
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(afterCallback1).not.toHaveBeenCalled()
    expect(afterCallback2).not.toHaveBeenCalled()

    // the response is done.
    onCloseCallback!()
    await Promise.resolve(null)

    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(afterCallback2).toHaveBeenCalledTimes(0)
    expect(waitUntil).toHaveBeenCalledTimes(1)

    promise1.resolve('1')
    await Promise.resolve(null)

    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(afterCallback2).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(1)
    promise2.resolve('2')

    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual([
      undefined, // callbacks all get collected into a big void promise
    ])
  })

  it('does not hang forever if onClose failed', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))

    const onClose = jest.fn(() => {
      throw new Error('onClose is broken for some reason')
    })

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: undefined,
    })

    const workStore = createMockWorkStore(afterContext)

    const run = createRun(afterContext, workStore)

    // ==================================

    const afterCallback1 = jest.fn()

    await run(async () => {
      after(afterCallback1)
    })

    expect(waitUntil).toHaveBeenCalledTimes(1) // runCallbacksOnClose
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(afterCallback1).not.toHaveBeenCalled()

    // if we didn't properly reject the runCallbacksOnClose promise, this should hang forever, and get killed by jest.
    const results = await Promise.allSettled(waitUntilPromises)
    expect(results).toEqual([
      { status: 'rejected', value: undefined, reason: expect.anything() },
    ])
  })

  it('runs all after() callbacks even if some of them threw', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))

    let onCloseCallback: (() => void) | undefined = undefined
    const onClose = jest.fn((cb) => {
      onCloseCallback = cb
    })

    const onTaskError = jest.fn()

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError,
    })

    const workStore = createMockWorkStore(afterContext)

    // ==================================

    const promise1 = new DetachedPromise<string>()
    const afterCallback1 = jest.fn(() => promise1.promise)

    const thrownFromCallback2 = new Error('2')
    const afterCallback2 = jest.fn(() => {
      throw thrownFromCallback2
    })

    const promise3 = new DetachedPromise<string>()
    const afterCallback3 = jest.fn(() => promise3.promise)

    const thrownFromPromise4 = new Error('4')
    const promise4 = Promise.reject(thrownFromPromise4)

    workAsyncStorage.run(workStore, () =>
      workUnitAsyncStorage.run(createMockWorkUnitStore(), () => {
        after(afterCallback1)
        after(afterCallback2)
        after(afterCallback3)
        after(promise4)
      })
    )

    expect(afterCallback1).not.toHaveBeenCalled()
    expect(afterCallback2).not.toHaveBeenCalled()
    expect(afterCallback3).not.toHaveBeenCalled()
    expect(waitUntil).toHaveBeenCalledTimes(1 + 1) // once for callbacks, once for the promise

    // the response is done.
    onCloseCallback!()
    await Promise.resolve(null)

    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(afterCallback2).toHaveBeenCalledTimes(1)
    expect(afterCallback3).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(1 + 1) // once for callbacks, once for the promise

    // resolve any pending promises we have
    const thrownFromCallback1 = new Error('1')
    promise1.reject(thrownFromCallback1)
    promise3.resolve('3')

    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual([undefined])
    expect(onTaskError).toHaveBeenCalledWith(thrownFromCallback2)
    expect(onTaskError).toHaveBeenCalledWith(thrownFromCallback1)
    expect(onTaskError).toHaveBeenCalledWith(thrownFromPromise4)
  })

  it('throws from after() if waitUntil is not provided', async () => {
    const waitUntil = undefined
    const onClose = jest.fn()

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: undefined,
    })

    const workStore = createMockWorkStore(afterContext)

    const run = createRun(afterContext, workStore)

    // ==================================

    const afterCallback1 = jest.fn()

    expect(() =>
      run(() => {
        after(afterCallback1)
      })
    ).toThrow(/`waitUntil` is not available in the current environment/)

    expect(onClose).not.toHaveBeenCalled()
    expect(afterCallback1).not.toHaveBeenCalled()
  })

  it('does NOT shadow workAsyncStorage within after callbacks', async () => {
    const waitUntil = jest.fn()

    let onCloseCallback: (() => void) | undefined = undefined
    const onClose = jest.fn((cb) => {
      onCloseCallback = cb
    })

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: undefined,
    })

    const workStore = createMockWorkStore(afterContext)
    const run = createRun(afterContext, workStore)

    // ==================================

    const stores = new DetachedPromise<
      [WorkStore | undefined, WorkStore | undefined]
    >()

    await run(async () => {
      const store1 = workAsyncStorage.getStore()
      after(() => {
        const store2 = workAsyncStorage.getStore()
        stores.resolve([store1, store2])
      })
    })

    // the response is done.
    onCloseCallback!()

    const [store1, store2] = await stores.promise
    // if we use .toBe, the proxy from createMockWorkStore throws because jest checks '$$typeof'
    expect(store1).toBeTruthy()
    expect(store2).toBeTruthy()
    expect(store1 === workStore).toBe(true)
    expect(store2 === store1).toBe(true)
  })

  it('preserves the ALS context the callback was created in', async () => {
    type TestStore = string
    const testStorage = new AsyncLocalStorage<TestStore>()

    const waitUntil = jest.fn()

    let onCloseCallback: (() => void) | undefined = undefined
    const onClose = jest.fn((cb) => {
      onCloseCallback = cb
    })

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: undefined,
    })

    const workStore = createMockWorkStore(afterContext)
    const run = createRun(afterContext, workStore)

    // ==================================

    const stores = new DetachedPromise<
      [TestStore | undefined, TestStore | undefined]
    >()

    await testStorage.run('value', () =>
      run(async () => {
        const store1 = testStorage.getStore()
        after(() => {
          const store2 = testStorage.getStore()
          stores.resolve([store1, store2])
        })
      })
    )

    // the response is done.
    onCloseCallback!()

    const [store1, store2] = await stores.promise
    // if we use .toBe, the proxy from createMockWorkStore throws because jest checks '$$typeof'
    expect(store1).toBeDefined()
    expect(store2).toBeDefined()
    expect(store1 === 'value').toBe(true)
    expect(store2 === store1).toBe(true)
  })
})

const createMockWorkStore = (afterContext: AfterContext): WorkStore => {
  const partialStore: Partial<WorkStore> = {
    afterContext: afterContext,
    forceStatic: false,
    forceDynamic: false,
    dynamicShouldError: false,
    isStaticGeneration: false,
    revalidatedTags: [],
    pendingRevalidates: undefined,
    pendingRevalidateWrites: undefined,
    incrementalCache: undefined,
  }

  return new Proxy(partialStore as WorkStore, {
    get(target, key) {
      if (key in target) {
        return target[key as keyof typeof target]
      }
      throw new Error(
        `WorkStore property not mocked: '${typeof key === 'symbol' ? key.toString() : key}'`
      )
    },
  })
}

const createMockWorkUnitStore = () => {
  return { phase: 'render' } as WorkUnitStore
}
