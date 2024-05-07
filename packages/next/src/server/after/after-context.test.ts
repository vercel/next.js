import { DetachedPromise } from '../../lib/detached-promise'
import { AsyncLocalStorage } from 'async_hooks'

import type { RequestStore } from '../../client/components/request-async-storage.external'
import type { AfterContext } from './after-context'

const createMockRequestStore = (afterContext: AfterContext): RequestStore => {
  return {
    afterContext: afterContext,
    // not needed:
    assetPrefix: '',
    cookies: undefined!,
    draftMode: undefined!,
    headers: undefined!,
    mutableCookies: undefined!,
    reactLoadableManifest: undefined!,
  }
}

describe('createAfterContext', () => {
  // 'async-local-storage.ts' needs `AsyncLocalStorage` on `globalThis` at import time,
  // so we have to do some contortions here to set it up before running anything else
  type RASMod =
    typeof import('../../client/components/request-async-storage.external')
  type AfterMod = typeof import('./after')
  type AfterContextMod = typeof import('./after-context')

  let requestAsyncStorage: RASMod['requestAsyncStorage']
  let createAfterContext: AfterContextMod['createAfterContext']
  let after: AfterMod['unstable_after']

  beforeAll(async () => {
    // @ts-expect-error
    globalThis.AsyncLocalStorage = AsyncLocalStorage

    const RASMod = await import(
      '../../client/components/request-async-storage.external'
    )
    requestAsyncStorage = RASMod.requestAsyncStorage

    const AfterContextMod = await import('./after-context')
    createAfterContext = AfterContextMod.createAfterContext

    const AfterMod = await import('./after')
    after = AfterMod.unstable_after
  })

  it('runs after() callbacks from a run() callback that resolves', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))

    let onCloseCallback: (() => void) | undefined = undefined
    const onClose = jest.fn((cb) => {
      onCloseCallback = cb
    })

    const afterContext = createAfterContext({
      waitUntil,
      onClose,
      cacheScope: undefined,
    })

    const requestStore = createMockRequestStore(afterContext)

    const run = <T>(cb: () => T): Promise<T> =>
      requestAsyncStorage.run(requestStore, () =>
        afterContext.run(requestStore, cb)
      )

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
      expect(waitUntil).toHaveBeenCalledTimes(2) // just the keepAliveLock

      await Promise.resolve(null)

      after(afterCallback2)
      expect(waitUntil).toHaveBeenCalledTimes(2) // only one keepAliveLock should be added for all callbacks
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(afterCallback1).not.toHaveBeenCalled()
    expect(afterCallback2).not.toHaveBeenCalled()

    // the response is done.
    onCloseCallback!()

    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(afterCallback2).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(2 + 2)

    promise0.resolve('0')
    promise1.resolve('1')
    promise2.resolve('2')

    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual(['0', /* lock */ undefined, '1', '2'])
  })

  it('runs after() callbacks from a run() callback that throws', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))

    let onCloseCallback: (() => void) | undefined = undefined
    const onClose = jest.fn((cb) => {
      onCloseCallback = cb
    })

    const afterContext = createAfterContext({
      waitUntil,
      onClose,
      cacheScope: undefined,
    })

    const requestStore = createMockRequestStore(afterContext)

    const run = <T>(cb: () => T): Promise<T> =>
      requestAsyncStorage.run(requestStore, () =>
        afterContext.run(requestStore, cb)
      )

    // ==================================

    const promise1 = new DetachedPromise<string>()
    const afterCallback1 = jest.fn(() => promise1.promise)

    await run(() => {
      after(afterCallback1)
      throw new Error('boom!')
    }).catch(() => {})

    // keepAliveLock
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)

    expect(afterCallback1).not.toHaveBeenCalled()

    // the response is done.
    onCloseCallback!()

    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(2)

    promise1.resolve('1')

    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual([/* lock */ undefined, '1'])
  })

  it('runs after() callbacks from a run() callback that streams', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))

    let onCloseCallback: (() => void) | undefined = undefined
    const onClose = jest.fn((cb) => {
      onCloseCallback = cb
    })

    const afterContext = createAfterContext({
      waitUntil,
      onClose,
      cacheScope: undefined,
    })

    const requestStore = createMockRequestStore(afterContext)

    const run = <T>(cb: () => T): Promise<T> =>
      requestAsyncStorage.run(requestStore, () =>
        afterContext.run(requestStore, cb)
      )

    // ==================================

    const promise1 = new DetachedPromise<string>()
    const afterCallback1 = jest.fn(() => promise1.promise)

    const promise2 = new DetachedPromise<string>()
    const afterCallback2 = jest.fn(() => promise2.promise)

    const streamStarted = new DetachedPromise<void>()

    const stream = await run(() => {
      return new ReadableStream<string>({
        async start(controller) {
          await streamStarted.promise // block the stream to start it manually later

          const delay = () =>
            new Promise<void>((resolve) => setTimeout(resolve, 50))

          after(afterCallback1)
          controller.enqueue('one')
          await delay()
          expect(waitUntil).toHaveBeenCalledTimes(1) // keepAliveLock

          after(afterCallback2)
          controller.enqueue('two')
          await delay()
          expect(waitUntil).toHaveBeenCalledTimes(1) // keepAliveLock

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

    // keepAliveLock
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(1)

    expect(afterCallback1).not.toHaveBeenCalled()
    expect(afterCallback2).not.toHaveBeenCalled()

    // the response is done.
    onCloseCallback!()

    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(afterCallback2).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(1 + 2)

    promise1.resolve('1')
    promise2.resolve('2')

    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual([/* lock */ undefined, '1', '2'])
  })

  it('releases the lock if onClose failed', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))

    const onClose = jest.fn(() => {
      throw new Error('onClose is broken for some reason')
    })

    const afterContext = createAfterContext({
      waitUntil,
      onClose,
      cacheScope: undefined,
    })

    const requestStore = createMockRequestStore(afterContext)

    const run = <T>(cb: () => T): Promise<T> =>
      requestAsyncStorage.run(requestStore, () =>
        afterContext.run(requestStore, cb)
      )

    // ==================================

    const afterCallback1 = jest.fn()

    await run(() => {
      after(afterCallback1)
    }).catch(() => {})

    expect(waitUntil).toHaveBeenCalledTimes(1) // keepAliveLock
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(afterCallback1).not.toHaveBeenCalled()

    // if the lock didn't get released, this should hang forever, and get killed by jest.
    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual([undefined])
  })

  it('runs all after() callbacks even if some of them threw', async () => {
    const waitUntilPromises: Promise<unknown>[] = []
    const waitUntil = jest.fn((promise) => waitUntilPromises.push(promise))

    let onCloseCallback: (() => void) | undefined = undefined
    const onClose = jest.fn((cb) => {
      onCloseCallback = cb
    })

    const afterContext = createAfterContext({
      waitUntil,
      onClose,
      cacheScope: undefined,
    })

    const requestStore = createMockRequestStore(afterContext)

    // ==================================

    const promise1 = new DetachedPromise<string>()
    const afterCallback1 = jest.fn(() => promise1.promise)

    const afterCallback2 = jest.fn(() => {
      throw new Error('2')
    })

    const promise3 = new DetachedPromise<string>()
    const afterCallback3 = jest.fn(() => promise3.promise)

    await requestAsyncStorage.run(requestStore, () =>
      afterContext.run(requestStore, () => {
        after(afterCallback1)
        after(afterCallback2)
        after(afterCallback3)
      })
    )

    expect(afterCallback1).not.toHaveBeenCalled()
    expect(afterCallback2).not.toHaveBeenCalled()
    expect(afterCallback3).not.toHaveBeenCalled()
    expect(waitUntil).toHaveBeenCalledTimes(1)

    // the response is done.
    onCloseCallback!()

    expect(afterCallback1).toHaveBeenCalledTimes(1)
    expect(afterCallback2).toHaveBeenCalledTimes(1)
    expect(afterCallback3).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(1 + 2)

    promise1.reject(new Error('1'))
    promise3.resolve('3')

    const results = await Promise.all(waitUntilPromises)
    expect(results).toEqual([
      /* 0: lock   */ undefined,
      /* 1: caught */ undefined,
      /* 2: sync - no promise */
      /* 3: ok     */ '3',
    ])
  })
})
