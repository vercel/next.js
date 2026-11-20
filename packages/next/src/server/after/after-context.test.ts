import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'
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
    (
      _afterContext: AfterContext,
      workStore: WorkStore,
      workUnitStore: WorkUnitStore
    ) =>
    <T>(cb: () => T): T => {
      return workAsyncStorage.run(workStore, () =>
        workUnitAsyncStorage.run(workUnitStore, cb)
      )
    }

  it('runs after() callbacks from a run() callback that resolves', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))
    const taskErrors: unknown[] = []
    const { onClose, triggerOnClose } = createOnClose()

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: taskErrors.push.bind(taskErrors),
    })

    expect(onClose).toHaveBeenCalledTimes(1) // called once when initializing

    const workStore = createMockWorkStore(afterContext)
    const workUnitStore = createMockWorkUnitStore()
    const run = createRun(afterContext, workStore, workUnitStore)

    // ==================================

    const promise0 = createPromiseWithResolvers<string>()

    const promise1 = createPromiseWithResolvers<string>()
    const afterCallback1 = jest.fn(() => promise1.promise)

    const promise2 = createPromiseWithResolvers<string>()
    const afterCallback2 = jest.fn(() => promise2.promise)

    await run(async () => {
      expect(waitUntil).toHaveBeenCalledTimes(0)
      after(promise0.promise)
      expect(waitUntil).toHaveBeenCalledTimes(1) // bump: called for promises
      expect(onClose).toHaveBeenCalledTimes(1) // unchanged

      await Promise.resolve(null)

      after(afterCallback1)
      expect(onClose).toHaveBeenCalledTimes(2) // bump: runCallbacksOnClose
      expect(waitUntil).toHaveBeenCalledTimes(2) // bump: runCallbacksOnClose

      await Promise.resolve(null)

      after(afterCallback2)
      expect(waitUntil).toHaveBeenCalledTimes(2) // unchanged: should only `waitUntil(this.runCallbacksOnClose())` once for all callbacks
    })

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(afterCallback1).not.toHaveBeenCalled()
    expect(afterCallback2).not.toHaveBeenCalled()

    // the response is done.
    triggerOnClose()
    await waitForCallbackQueue()

    expect(workUnitStore.phase).toBe('after')
    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(afterCallback2).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(2)

    promise0.resolve('0')
    promise1.resolve('1')
    promise2.resolve('2')

    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual([
      undefined, // the results of promises are dropped
      undefined, // callbacks all get collected into a big void promise
    ])
    expect(taskErrors).toEqual([])
  })

  it('runs after() callbacks from a run() callback that throws', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))
    const taskErrors: unknown[] = []
    const { onClose, triggerOnClose } = createOnClose()

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: taskErrors.push.bind(taskErrors),
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    const workStore = createMockWorkStore(afterContext)
    const workUnitStore = createMockWorkUnitStore()

    const run = createRun(afterContext, workStore, workUnitStore)

    // ==================================

    const promise1 = createPromiseWithResolvers<string>()
    const afterCallback1 = jest.fn(() => promise1.promise)

    await run(async () => {
      after(afterCallback1)
      throw new Error('boom!')
    }).catch(() => {})

    // runCallbacksOnClose
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(2)

    expect(afterCallback1).not.toHaveBeenCalled()

    // the response is done.
    triggerOnClose()
    await waitForCallbackQueue()

    expect(workUnitStore.phase).toBe('after')
    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(1)

    promise1.resolve('1')

    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual([undefined])
    expect(taskErrors).toEqual([])
  })

  it('runs after() callbacks from a run() callback that streams', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))
    const taskErrors: unknown[] = []
    const { onClose, triggerOnClose } = createOnClose()

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: taskErrors.push.bind(taskErrors),
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    const workStore = createMockWorkStore(afterContext)
    const workUnitStore = createMockWorkUnitStore()

    const run = createRun(afterContext, workStore, workUnitStore)

    // ==================================

    const promise1 = createPromiseWithResolvers<string>()
    const afterCallback1 = jest.fn(() => promise1.promise)

    const promise2 = createPromiseWithResolvers<string>()
    const afterCallback2 = jest.fn(() => promise2.promise)

    const streamStarted = createPromiseWithResolvers<void>()

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

    expect(onClose).toHaveBeenCalledTimes(1) // unchanged: no after()s executed yet
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
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(waitUntil).toHaveBeenCalledTimes(1)

    expect(afterCallback1).not.toHaveBeenCalled()
    expect(afterCallback2).not.toHaveBeenCalled()

    // the response is done.
    triggerOnClose()
    await waitForCallbackQueue()

    expect(workUnitStore.phase).toBe('after')
    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(afterCallback2).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(1)

    promise1.resolve('1')
    promise2.resolve('2')

    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual([undefined])
    expect(taskErrors).toEqual([])
  })

  it('runs after() callbacks added within an after()', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))
    const taskErrors: unknown[] = []
    const { onClose, triggerOnClose } = createOnClose()

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: taskErrors.push.bind(taskErrors),
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    const workStore = createMockWorkStore(afterContext)
    const workUnitStore = createMockWorkUnitStore()
    const run = createRun(afterContext, workStore, workUnitStore)

    // ==================================

    const promise1 = createPromiseWithResolvers<string>()
    const afterCallback1 = jest.fn(async () => {
      await promise1.promise
      after(afterCallback2)
    })

    const promise2 = createPromiseWithResolvers<string>()
    const afterCallback2 = jest.fn(() => promise2.promise)

    await run(async () => {
      after(afterCallback1)
      expect(onClose).toHaveBeenCalledTimes(2) // bump: runCallbacksOnClose
      expect(waitUntil).toHaveBeenCalledTimes(1) // bump: runCallbacksOnClose
    })

    expect(onClose).toHaveBeenCalledTimes(2) // bump: runCallbacksOnClose
    expect(afterCallback1).not.toHaveBeenCalled()
    expect(afterCallback2).not.toHaveBeenCalled()

    // the response is done.
    triggerOnClose()
    await waitForCallbackQueue()

    expect(workUnitStore.phase).toBe('after')
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
    expect(taskErrors).toEqual([])
  })

  it('waits for promises added via after(promise)', async () => {
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
    const workUnitStore = createMockWorkUnitStore()
    const run = createRun(afterContext, workStore, workUnitStore)

    // ==================================

    const promise = createPromiseWithResolvers<void>()
    let promiseDidResolve = false
    promise.promise.then(() => {
      promiseDidResolve = true
    })

    await run(() => {
      afterContext.after(promise.promise, workUnitStore)
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(waitUntil).toHaveBeenCalledTimes(1) // just runCallbacksOnClose
    })

    // the response is done.
    onCloseCallback!()
    await Promise.resolve(null)

    expect(workUnitStore.phase).toBe('after')

    setTimeout(() => promise.resolve(), 50)
    await Promise.all(waitUntilPromises)
    expect(promiseDidResolve).toBe(true)
  })

  it('runs after() callbacks added from after(promise) after onClose', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))
    const taskErrors: unknown[] = []
    const { onClose, triggerOnClose } = createOnClose()

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: taskErrors.push.bind(taskErrors),
    })

    const workStore = createMockWorkStore(afterContext)
    const workUnitStore = createMockWorkUnitStore()
    const run = createRun(afterContext, workStore, workUnitStore)

    // ==================================

    const promise1 = createPromiseWithResolvers<void>()
    const promise2 = createPromiseWithResolvers<void>()

    let afterCallback2DidFinish = false
    const afterCallback2 = jest.fn(async () => {
      await promise2.promise
      afterCallback2DidFinish = true
    })

    await run(async () => {
      const afterPromise1 = (async () => {
        await promise1.promise

        after(afterCallback2)
        await waitForCallbackQueue()
        expect(afterCallback2).toHaveBeenCalledTimes(1)
      })()

      // only `after()` a promise, no callbacks
      after(afterPromise1)
    })

    expect(onClose).toHaveBeenCalledTimes(1) // unchanged
    expect(waitUntil).toHaveBeenCalledTimes(1) // promise

    // the response is done.
    triggerOnClose()

    expect(workUnitStore.phase).toBe('after')

    promise1.resolve() // unblock the promise, leading to an `after(callback)`

    await waitForCallbackQueue()

    expect(afterCallback2).toHaveBeenCalledTimes(1)
    promise2.resolve() // unblock the callback

    const results = await Promise.all(waitUntilPromises)
    await Promise.resolve(null)

    expect(afterCallback2DidFinish).toBe(true)
    expect(waitUntil).toHaveBeenCalledTimes(2)
    expect(results).toEqual([
      undefined, // callbacks all get collected into a big void promise
    ])
    expect(taskErrors).toEqual([])
  })

  it('runs callbacks registered after close in the after phase', async () => {
    const completions: Promise<unknown>[] = []
    const { onClose, triggerOnClose } = createOnClose()
    const afterContext = new AfterContext({
      waitUntil: (promise) => completions.push(promise),
      onClose,
      onTaskError: undefined,
    })
    const workStore = createMockWorkStore(afterContext)
    const workUnitStore = createMockWorkUnitStore()
    const run = createRun(afterContext, workStore, workUnitStore)
    triggerOnClose()
    const callback = jest.fn(() => workUnitStore.phase)
    run(() => after(callback))
    await Promise.all(completions)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.results[0].value).toBe('after')
  })

  it('reports onClose failures', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))
    const taskErrors: unknown[] = []

    const onClose = jest.fn(() => {
      throw new Error('onClose is broken for some reason')
    })

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: taskErrors.push.bind(taskErrors),
    })

    expect(onClose).toHaveBeenCalledTimes(1)

    const workStore = createMockWorkStore(afterContext)
    const workUnitStore = createMockWorkUnitStore()

    const run = createRun(afterContext, workStore, workUnitStore)

    // ==================================

    const afterCallback1 = jest.fn()

    await expect(
      run(async () => {
        after(afterCallback1)
      })
    ).rejects.toEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          `An onClose call failed, which means after() can't work correctly.`
        ),
      })
    )

    expect(waitUntil).toHaveBeenCalledTimes(0)
    expect(afterCallback1).not.toHaveBeenCalled()
    expect(taskErrors).toEqual([])
  })

  it('runs all after() callbacks even if some of them threw', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))
    const { onClose, triggerOnClose } = createOnClose()

    const onTaskError = jest.fn()

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError,
    })

    const workStore = createMockWorkStore(afterContext)
    const workUnitStore = createMockWorkUnitStore()
    const run = createRun(afterContext, workStore, workUnitStore)

    // ==================================

    const promise1 = createPromiseWithResolvers<string>()
    const afterCallback1 = jest.fn(() => promise1.promise)

    const thrownFromCallback2 = new Error('2')
    const afterCallback2 = jest.fn(() => {
      throw thrownFromCallback2
    })

    const promise3 = createPromiseWithResolvers<string>()
    const afterCallback3 = jest.fn(() => promise3.promise)

    const thrownFromPromise4 = new Error('4')
    const promise4 = Promise.reject(thrownFromPromise4)

    run(() => {
      after(afterCallback1)
      after(afterCallback2)
      after(afterCallback3)
      after(promise4)
    })

    expect(afterCallback1).not.toHaveBeenCalled()
    expect(afterCallback2).not.toHaveBeenCalled()
    expect(afterCallback3).not.toHaveBeenCalled()
    expect(waitUntil).toHaveBeenCalledTimes(1 + 1) // once for callbacks, once for the promise

    // the response is done.
    triggerOnClose()
    await waitForCallbackQueue()

    expect(workUnitStore.phase).toBe('after')
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
    const taskErrors: unknown[] = []
    const onClose = jest.fn()

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: taskErrors.push.bind(taskErrors),
    })

    expect(onClose).toHaveBeenCalledTimes(1)

    const workStore = createMockWorkStore(afterContext)
    const workUnitStore = createMockWorkUnitStore()

    const run = createRun(afterContext, workStore, workUnitStore)

    // ==================================

    const afterCallback1 = jest.fn()

    expect(() =>
      run(() => {
        after(afterCallback1)
      })
    ).toThrow(/`waitUntil` is not available in the current environment/)

    expect(onClose).toHaveBeenCalledTimes(1) // unchanged
    expect(afterCallback1).not.toHaveBeenCalled()
    expect(taskErrors).toEqual([])
  })

  it('does NOT shadow workAsyncStorage or workUnitAsyncStorage within after callbacks', async () => {
    const waitUntil = jest.fn()
    const taskErrors: unknown[] = []
    const { onClose, triggerOnClose } = createOnClose()

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: taskErrors.push.bind(taskErrors),
    })

    const workStore = createMockWorkStore(afterContext)
    const workUnitStore = createMockWorkUnitStore()
    const run = createRun(afterContext, workStore, workUnitStore)

    // ==================================

    type Stores = {
      workStore: WorkStore | undefined
      workUnitStore: WorkUnitStore | undefined
    }
    const stores = createPromiseWithResolvers<[Stores, Stores]>()

    await run(async () => {
      const stores1 = {
        workStore: workAsyncStorage.getStore(),
        workUnitStore: workUnitAsyncStorage.getStore(),
      }
      after(() => {
        const stores2 = {
          workStore: workAsyncStorage.getStore(),
          workUnitStore: workUnitAsyncStorage.getStore(),
        }
        stores.resolve([stores1, stores2])
      })
    })

    // the response is done.
    triggerOnClose()

    await Promise.resolve(null)
    expect(workUnitStore.phase).toBe('after')

    const [stores1, stores2] = await stores.promise
    expect(stores1.workStore).toBeTruthy()
    expect(stores1.workUnitStore).toBeTruthy()
    expect(stores2.workStore).toBeTruthy()
    expect(stores2.workUnitStore).toBeTruthy()
    // if we use .toBe, the proxy from createMockWorkStore throws because jest checks '$$typeof'
    expect(stores1.workStore === workStore).toBe(true)
    expect(stores1.workUnitStore === workUnitStore).toBe(true)
    expect(stores2.workStore === workStore).toBe(true)
    expect(stores2.workUnitStore === workUnitStore).toBe(true)

    expect(taskErrors).toEqual([])
  })

  it('preserves the ALS context the callback was created in', async () => {
    type TestStore = string
    const testStorage = new AsyncLocalStorage<TestStore>()
    const waitUntil = jest.fn()
    const taskErrors: unknown[] = []
    const { onClose, triggerOnClose } = createOnClose()

    const afterContext = new AfterContext({
      waitUntil,
      onClose,
      onTaskError: taskErrors.push.bind(taskErrors),
    })

    const workStore = createMockWorkStore(afterContext)
    const workUnitStore = createMockWorkUnitStore()
    const run = createRun(afterContext, workStore, workUnitStore)

    // ==================================

    const stores =
      createPromiseWithResolvers<
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
    triggerOnClose()

    await Promise.resolve(null)
    expect(workUnitStore.phase).toBe('after')

    const [store1, store2] = await stores.promise
    // if we use .toBe, the proxy from createMockWorkStore throws because jest checks '$$typeof'
    expect(store1).toBeDefined()
    expect(store2).toBeDefined()
    expect(store1 === 'value').toBe(true)
    expect(store2 === store1).toBe(true)
    expect(taskErrors).toEqual([])
  })

  describe('revalidations on close', () => {
    function setup(overrides: MockWorkStoreOverrides = {}) {
      const completions: Promise<unknown>[] = []
      const { onClose, triggerOnClose } = createOnClose()
      const afterContext = new AfterContext({
        waitUntil: (promise) => completions.push(promise),
        onClose,
        onTaskError: undefined,
      })
      const workStore = createMockWorkStore(afterContext, overrides)
      return { afterContext, workStore, completions, triggerOnClose }
    }

    it('waits for late writes without waiting again for an earlier flush', async () => {
      const { afterContext, workStore, completions, triggerOnClose } = setup()

      const initial = createPromiseWithResolvers<void>()
      const late = createPromiseWithResolvers<void>()
      workStore.pendingRevalidateWrites = [initial.promise]
      const initialFlush = afterContext.executeRevalidations(workStore)
      expect(completions).toHaveLength(1)
      workStore.pendingRevalidateWrites.push(late.promise)
      let settled = false
      completions[0].then(() => {
        settled = true
      })

      try {
        triggerOnClose()
        await waitForCallbackQueue()
        expect(settled).toBe(false)
        late.resolve()
        await completions[0]
        expect(settled).toBe(true)
      } finally {
        initial.resolve()
        late.resolve()
        await initialFlush
      }
    })

    it('waits for late writes when the initial flush is empty', async () => {
      const { afterContext, workStore, completions, triggerOnClose } = setup()
      expect(afterContext.executeRevalidations(workStore)).toBe(false)
      expect(completions).toHaveLength(1)

      const late = createPromiseWithResolvers<void>()
      workStore.pendingRevalidateWrites = [late.promise]
      let settled = false
      completions[0].then(() => {
        settled = true
      })

      try {
        triggerOnClose()
        await waitForCallbackQueue()
        expect(settled).toBe(false)
      } finally {
        late.resolve()
        await completions[0]
      }
      expect(settled).toBe(true)
    })

    it('waits for a new promise registered under a previously flushed key', async () => {
      const { afterContext, workStore, completions, triggerOnClose } = setup()
      afterContext.scheduleRevalidationsOnClose(workStore)
      workStore.pendingRevalidates = { key: Promise.resolve() }
      await afterContext.executeRevalidations(workStore)

      const replacement = createPromiseWithResolvers<void>()
      workStore.pendingRevalidates.key = replacement.promise
      let settled = false
      completions[0].then(() => {
        settled = true
      })
      try {
        triggerOnClose()
        await waitForCallbackQueue()
        expect(settled).toBe(false)
      } finally {
        replacement.resolve()
        await completions[0]
      }
    })

    it('does not repeat flushed tags with colons in tags and profiles', async () => {
      const revalidateTag = jest.fn(() => Promise.resolve())
      const profile = { stale: 0, revalidate: 60, expire: 3600 }
      const { afterContext, workStore, completions, triggerOnClose } = setup({
        incrementalCache: { revalidateTag },
        cacheLifeProfiles: { default: profile, c: profile, 'b:c': profile },
      })
      workStore.pendingRevalidatedTags = [
        { tag: 'a:b', profile: 'c', revalidatedAt: 2 },
        { tag: 'a', profile: 'b:c', revalidatedAt: 1 },
      ]
      afterContext.scheduleRevalidationsOnClose(workStore)
      await afterContext.executeRevalidations(workStore)
      expect(revalidateTag).toHaveBeenCalledTimes(2)
      triggerOnClose()
      await completions[0]
      expect(revalidateTag).toHaveBeenCalledTimes(2)
    })

    it('flushes streamed tags at close and callback tags after the callback completes', async () => {
      const { revalidateTag } = await import('../web/spec-extension/revalidate')
      const updateTags = jest.fn(() => Promise.resolve())
      const { afterContext, workStore, completions, triggerOnClose } = setup({
        incrementalCache: { revalidateTag: updateTags },
      })
      const workUnitStore = {
        type: 'request',
        phase: 'action',
      } as WorkUnitStore
      const run = createRun(afterContext, workStore, workUnitStore)
      const callbackCompletion = createPromiseWithResolvers<void>()

      await run(() => {
        revalidateTag('early', { expire: 0 })
        after(async () => {
          revalidateTag('callback', { expire: 0 })
          await callbackCompletion.promise
        })
        return afterContext.executeRevalidations(workStore)
      })
      expect(updateTags.mock.calls).toEqual([[['early'], { expire: 0 }]])

      run(() => revalidateTag('streamed', { expire: 0 }))
      try {
        expect(updateTags.mock.calls).toEqual([[['early'], { expire: 0 }]])
        triggerOnClose()
        await waitForCallbackQueue()
        expect(updateTags.mock.calls).toEqual([
          [['early'], { expire: 0 }],
          [['streamed'], { expire: 0 }],
        ])
      } finally {
        callbackCompletion.resolve()
        await Promise.all(completions)
      }
      expect(updateTags.mock.calls).toEqual([
        [['early'], { expire: 0 }],
        [['streamed'], { expire: 0 }],
        [['callback'], { expire: 0 }],
      ])
    })

    it('does not register a close wait after close was already observed', () => {
      const { afterContext, workStore, completions, triggerOnClose } = setup()
      triggerOnClose()
      afterContext.scheduleRevalidationsOnClose(workStore)
      expect(completions).toHaveLength(0)
    })

    it('preserves the registration context when flushing at close', async () => {
      let observedStore: WorkStore | undefined
      const { afterContext, workStore, completions, triggerOnClose } = setup({
        incrementalCache: {
          revalidateTag: async () => {
            observedStore = workAsyncStorage.getStore()
          },
        },
      })
      workAsyncStorage.run(workStore, () => {
        afterContext.scheduleRevalidationsOnClose(workStore)
      })
      workStore.pendingRevalidatedTags = [{ tag: 'late', revalidatedAt: 1 }]
      triggerOnClose()
      await completions[0]
      expect(observedStore === workStore).toBe(true)
    })

    it('leaves revalidation to the explicit flush when waitUntil is unavailable', async () => {
      const { onClose, triggerOnClose } = createOnClose()
      const afterContext = new AfterContext({
        waitUntil: undefined,
        onClose,
        onTaskError: undefined,
      })
      const write = jest.fn(() => Promise.resolve())
      const workStore = createMockWorkStore(afterContext, {
        incrementalCache: { revalidateTag: write },
      })
      workStore.pendingRevalidatedTags = [{ tag: 'explicit', revalidatedAt: 1 }]
      afterContext.scheduleRevalidationsOnClose(workStore)
      triggerOnClose()
      expect(write).not.toHaveBeenCalled()
      const flushed = afterContext.executeRevalidations(workStore)
      expect(flushed).not.toBe(false)
      await flushed
      expect(write).toHaveBeenCalledTimes(1)
    })
  })
})

function createOnClose() {
  const callbacks: (() => void)[] = []
  const onClose = jest.fn((cb) => {
    callbacks.push(cb)
  })
  const triggerOnClose = () => {
    for (const callback of callbacks) {
      try {
        callback()
      } catch {}
    }
    callbacks.length = 0
  }
  return { onClose, triggerOnClose }
}

function waitForCallbackQueue() {
  return new Promise((resolve) => setImmediate(() => setImmediate(resolve)))
}

type MockWorkStoreOverrides = {
  incrementalCache?: Pick<
    NonNullable<WorkStore['incrementalCache']>,
    'revalidateTag'
  >
  cacheLifeProfiles?: WorkStore['cacheLifeProfiles']
}

const createMockWorkStore = (
  afterContext: AfterContext,
  overrides: MockWorkStoreOverrides = {}
): WorkStore => {
  const partialStore: Partial<Omit<WorkStore, 'incrementalCache'>> &
    MockWorkStoreOverrides = {
    afterContext: afterContext,
    forceStatic: false,
    forceDynamic: false,
    dynamicShouldError: false,
    pendingRevalidatedTags: [],
    pendingRevalidates: undefined,
    pendingRevalidateWrites: undefined,
    incrementalCache: undefined,
    ...overrides,
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
