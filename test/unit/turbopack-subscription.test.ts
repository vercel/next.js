import {
  createTurbopackSubscription,
  mapTurbopackSubscription,
} from 'next/dist/build/swc/turbopack-subscription'
import {
  clearServerHmrChunkCaches,
  getServerHmrRuntimeRoot,
} from 'next/dist/server/dev/hot-reloader-turbopack'
import { backgroundLogCompilationEvents } from 'next/dist/shared/lib/turbopack/compilation-events'
import type { Project } from 'next/dist/build/swc/types'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

describe('Turbopack subscription', () => {
  it('wakes a pending seed read and awaits exactly one async disposal', async () => {
    const task = { id: 'root-task' }
    const started = deferred<void>()
    const disposalStarted = deferred<void>()
    const disposal = deferred<void>()
    const disposeTask = jest.fn(async () => {
      disposalStarted.resolve()
      await disposal.promise
    })
    let emit!: (error: Error | undefined, value: number | undefined) => void
    const subscription = createTurbopackSubscription(
      false,
      async (callback) => {
        emit = callback
        started.resolve()
        return task
      },
      disposeTask
    )

    const seedRead = subscription.next()
    await started.promise
    const returning = subscription.return!()
    const repeatedReturn = subscription.return!()
    expect(repeatedReturn).toBe(returning)
    await disposalStarted.promise

    let returnSettled = false
    void returning.then(() => {
      returnSettled = true
    })
    await Promise.resolve()
    expect(returnSettled).toBe(false)

    disposal.resolve()
    await expect(seedRead).resolves.toEqual({ done: true, value: undefined })
    await expect(returning).resolves.toEqual({ done: true, value: undefined })
    expect(disposeTask).toHaveBeenCalledTimes(1)
    expect(disposeTask).toHaveBeenCalledWith(task)

    emit(undefined, 1)
    emit(new Error('late native callback'), undefined)
    await expect(subscription.next()).resolves.toEqual({
      done: true,
      value: undefined,
    })
  })

  it('waits for native startup before disposing a canceled subscription', async () => {
    const task = { id: 'late-root-task' }
    const startup = deferred<typeof task>()
    const nativeStarted = deferred<void>()
    const disposeTask = jest.fn()
    const subscription = createTurbopackSubscription(
      false,
      async () => {
        nativeStarted.resolve()
        return startup.promise
      },
      disposeTask
    )

    const seedRead = subscription.next()
    await nativeStarted.promise
    const returning = subscription.return!()
    let settled = false
    void returning.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    startup.resolve(task)
    await expect(seedRead).resolves.toEqual({ done: true, value: undefined })
    await expect(returning).resolves.toEqual({ done: true, value: undefined })
    expect(disposeTask).toHaveBeenCalledTimes(1)
    expect(disposeTask).toHaveBeenCalledWith(task)
  })

  it('does not start native work when returned before the first read', async () => {
    const nativeFunction = jest.fn(async () => ({ id: 'unreachable' }))
    const disposeTask = jest.fn()
    const subscription = createTurbopackSubscription(
      true,
      nativeFunction,
      disposeTask
    )

    await expect(subscription.return!()).resolves.toEqual({
      done: true,
      value: undefined,
    })
    await expect(subscription.next()).resolves.toEqual({
      done: true,
      value: undefined,
    })
    expect(nativeFunction).not.toHaveBeenCalled()
    expect(disposeTask).not.toHaveBeenCalled()
  })

  it('delegates mapped return while a source read is pending', async () => {
    const task = { id: 'entrypoints-root-task' }
    const started = deferred<void>()
    const disposeTask = jest.fn()
    let emit!: (error: Error | undefined, value: number | undefined) => void
    const source = createTurbopackSubscription(
      false,
      async (callback) => {
        emit = callback
        started.resolve()
        return task
      },
      disposeTask
    )
    const mapped = mapTurbopackSubscription(source, (value) => `entry-${value}`)

    const initial = mapped.next()
    await started.promise
    emit(undefined, 1)
    await expect(initial).resolves.toEqual({ done: false, value: 'entry-1' })

    const pendingRead = mapped.next()
    await new Promise<void>((resolve) => setImmediate(resolve))
    const returning = mapped.return!()
    await expect(pendingRead).resolves.toEqual({ done: true, value: undefined })
    await expect(returning).resolves.toEqual({ done: true, value: undefined })
    expect(disposeTask).toHaveBeenCalledTimes(1)
  })

  it('calls a mapped source return exactly once and awaits it', async () => {
    const closing = deferred<IteratorResult<number>>()
    const sourceReturn = jest.fn(() => closing.promise)
    const source: AsyncIterableIterator<number> = {
      next: jest.fn(async () => ({ done: false, value: 1 })),
      return: sourceReturn,
      [Symbol.asyncIterator]() {
        return source
      },
    }
    const mapped = mapTurbopackSubscription(source, String)

    const firstReturn = mapped.return!()
    const secondReturn = mapped.return!()
    expect(sourceReturn).toHaveBeenCalledTimes(1)

    let settled = false
    void firstReturn.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    closing.resolve({ done: true, value: undefined })
    await expect(firstReturn).resolves.toEqual({ done: true, value: undefined })
    await expect(secondReturn).resolves.toEqual({
      done: true,
      value: undefined,
    })
    expect(sourceReturn).toHaveBeenCalledTimes(1)
  })

  it('publishes mapped close ownership before a re-entrant source return', async () => {
    let reentrantReturn!: Promise<IteratorResult<string>>
    let mapped!: AsyncIterableIterator<string>
    const sourceReturn = jest.fn(async () => {
      reentrantReturn = mapped.return!()
      return { done: true, value: undefined } as IteratorReturnResult<number>
    })
    const source: AsyncIterableIterator<number> = {
      next: jest.fn(async () => ({ done: false, value: 1 })),
      return: sourceReturn,
      [Symbol.asyncIterator]() {
        return source
      },
    }
    mapped = mapTurbopackSubscription(source, String)

    await expect(mapped.return!()).resolves.toEqual({
      done: true,
      value: undefined,
    })
    await expect(reentrantReturn).resolves.toEqual({
      done: true,
      value: undefined,
    })
    expect(sourceReturn).toHaveBeenCalledTimes(1)
  })

  it('keeps a mapping failure primary while retaining disposal failure', async () => {
    const mappingFailure = new Error('invalid entrypoints payload')
    const disposalFailure = new Error('root task disposal failed')
    const started = deferred<void>()
    let emit!: (error: Error | undefined, value: number | undefined) => void
    const disposeTask = jest.fn(() => {
      throw disposalFailure
    })
    const source = createTurbopackSubscription(
      false,
      async (callback) => {
        emit = callback
        started.resolve()
        return { id: 'throwing-root-task' }
      },
      disposeTask
    )
    const mapped = mapTurbopackSubscription(source, () => {
      throw mappingFailure
    })

    const pending = mapped.next()
    await started.promise
    emit(undefined, 1)

    await expect(pending).rejects.toBe(mappingFailure)
    await expect(mapped.return!()).rejects.toBe(disposalFailure)
    expect(disposeTask).toHaveBeenCalledTimes(1)
  })

  it('retains both a subscription failure and its disposal failure', async () => {
    const subscriptionFailure = new Error('native subscription failed')
    const disposalFailure = new Error('root task disposal failed')
    const started = deferred<void>()
    let emit!: (error: Error | undefined, value: number | undefined) => void
    const subscription = createTurbopackSubscription(
      false,
      async (callback) => {
        emit = callback
        started.resolve()
        return { id: 'failing-root-task' }
      },
      () => {
        throw disposalFailure
      }
    )

    const pending = subscription.next()
    await started.promise
    emit(subscriptionFailure, undefined)

    let combinedFailure: unknown
    try {
      await pending
    } catch (error) {
      combinedFailure = error
    }

    expect(combinedFailure).toBeInstanceOf(AggregateError)
    expect((combinedFailure as AggregateError).errors).toEqual([
      subscriptionFailure,
      disposalFailure,
    ])
    await expect(subscription.return!()).rejects.toBe(combinedFailure)
  })
})

describe('background compilation-event subscription', () => {
  it('closes exactly once when the signal is already aborted', async () => {
    const pendingEvent = deferred<IteratorResult<never>>()
    const iteratorReturn = jest.fn(async () => {
      const result = {
        done: true,
        value: undefined,
      } as IteratorReturnResult<never>
      pendingEvent.resolve(result)
      return result
    })
    const iterator: AsyncIterableIterator<never> = {
      next: () => pendingEvent.promise,
      return: iteratorReturn,
      [Symbol.asyncIterator]() {
        return iterator
      },
    }
    const project = {
      compilationEventsSubscribe: () => iterator,
    } as unknown as Project
    const controller = new AbortController()
    controller.abort()

    await expect(
      backgroundLogCompilationEvents(project, { signal: controller.signal })
    ).resolves.toBeUndefined()
    expect(iteratorReturn).toHaveBeenCalledTimes(1)
  })

  it('awaits subscription disposal when aborted during a pending event', async () => {
    const started = deferred<void>()
    const disposalStarted = deferred<void>()
    const disposal = deferred<void>()
    const disposeTask = jest.fn(async () => {
      disposalStarted.resolve()
      await disposal.promise
    })
    const iterator = createTurbopackSubscription(
      true,
      async () => {
        started.resolve()
        return { id: 'compilation-events-root-task' }
      },
      disposeTask
    )
    const project = {
      compilationEventsSubscribe: () => iterator,
    } as unknown as Project
    const controller = new AbortController()

    const background = backgroundLogCompilationEvents(project, {
      signal: controller.signal,
    })
    await started.promise
    controller.abort()
    await disposalStarted.promise

    let settled = false
    void background.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    disposal.resolve()
    await expect(background).resolves.toBeUndefined()
    expect(disposeTask).toHaveBeenCalledTimes(1)
  })

  it('surfaces an abort-time disposal failure without an unhandled close', async () => {
    const disposalFailure = new Error('compilation event disposal failed')
    const started = deferred<void>()
    const iterator = createTurbopackSubscription(
      true,
      async () => {
        started.resolve()
        return { id: 'failing-compilation-events-root-task' }
      },
      () => {
        throw disposalFailure
      }
    )
    const project = {
      compilationEventsSubscribe: () => iterator,
    } as unknown as Project
    const controller = new AbortController()

    const background = backgroundLogCompilationEvents(project, {
      signal: controller.signal,
    })
    await started.promise
    controller.abort()

    await expect(background).rejects.toBe(disposalFailure)
  })
})

describe('server HMR chunk-cache isolation', () => {
  it('clears matching runtime roots once without touching another project', () => {
    const originalHandlers = globalThis.__turbopack_server_hmr_handlers__
    const clearProjectA = jest.fn()
    const clearProjectB = jest.fn()
    const handler = jest.fn()

    globalThis.__turbopack_server_hmr_handlers__ = new Map([
      [
        '/project-a/runtime-one.js',
        {
          handler,
          clearChunkCache: clearProjectA,
          runtimeRoot: '/project-a/.next',
          chunkPrefix: 'server/chunks',
        },
      ],
      [
        '/project-a/runtime-two.js',
        {
          handler,
          clearChunkCache: clearProjectA,
          runtimeRoot: '/project-a/.next',
          chunkPrefix: 'server/chunks/ssr',
        },
      ],
      [
        '/project-b/runtime.js',
        {
          handler,
          clearChunkCache: clearProjectB,
          runtimeRoot: '/project-b/.next',
          chunkPrefix: 'server/chunks',
        },
      ],
    ])

    try {
      clearServerHmrChunkCaches('/project-a/.next')
    } finally {
      if (originalHandlers) {
        globalThis.__turbopack_server_hmr_handlers__ = originalHandlers
      } else {
        delete globalThis.__turbopack_server_hmr_handlers__
      }
    }

    expect(clearProjectA).toHaveBeenCalledTimes(1)
    expect(clearProjectB).not.toHaveBeenCalled()
  })
})

describe('server HMR runtime identity', () => {
  it('matches the canonical runtime root for a symlinked dist directory', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'next-server-hmr-'))
    const actualDistDir = join(temporaryDirectory, 'actual')
    const linkedDistDir = join(temporaryDirectory, 'linked')

    try {
      mkdirSync(actualDistDir)
      symlinkSync(
        actualDistDir,
        linkedDistDir,
        process.platform === 'win32' ? 'junction' : 'dir'
      )

      expect(getServerHmrRuntimeRoot(linkedDistDir)).toBe(
        realpathSync(actualDistDir)
      )
      expect(getServerHmrRuntimeRoot(join(temporaryDirectory, 'missing'))).toBe(
        resolve(temporaryDirectory, 'missing')
      )
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true })
    }
  })
})
