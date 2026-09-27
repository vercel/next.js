import { AsyncLocalStorage } from 'async_hooks'
import type { AppPageModule } from './route-modules/app-page/module'
import type { WorkStore } from './app-render/work-async-storage.external'

type LoggerMod = typeof import('./client-component-renderer-logger')
type WASMod = typeof import('./app-render/work-async-storage.external')

let ClientComponentLoadTracker: LoggerMod['ClientComponentLoadTracker']
let getClientComponentLoaderMetrics: LoggerMod['getClientComponentLoaderMetrics']
let wrapClientComponentLoader: LoggerMod['wrapClientComponentLoader']
let finalizeClientComponentLoadTrackerOnStream: LoggerMod['finalizeClientComponentLoadTrackerOnStream']
let finalizeClientComponentLoadTrackerOnPrerender: LoggerMod['finalizeClientComponentLoadTrackerOnPrerender']
let finalizeClientComponentLoadTracker: LoggerMod['finalizeClientComponentLoadTracker']
let workAsyncStorage: WASMod['workAsyncStorage']

function createComponentModule(
  require: (
    ...args: Parameters<AppPageModule['__next_app__']['require']>
  ) => unknown,
  loadChunk: (
    ...args: Parameters<AppPageModule['__next_app__']['loadChunk']>
  ) => Promise<unknown>
) {
  return {
    __next_app__: { require, loadChunk },
  } as unknown as AppPageModule
}

function createTrackedWorkStore(
  page: string = '/test/page',
  route: string = '/test'
): WorkStore {
  return {
    page,
    route,
    clientComponentLoadTracker: new ClientComponentLoadTracker(),
  } as WorkStore
}

function runWithTrackedWorkStore<T>(fn: () => T): T {
  return workAsyncStorage.run(createTrackedWorkStore(), fn)
}

describe('client component renderer logger', () => {
  beforeAll(async () => {
    // AsyncLocalStorage must be available before workAsyncStorage is imported.
    // @ts-expect-error
    globalThis.AsyncLocalStorage = AsyncLocalStorage

    const logger = await import('./client-component-renderer-logger')
    ClientComponentLoadTracker = logger.ClientComponentLoadTracker
    getClientComponentLoaderMetrics = logger.getClientComponentLoaderMetrics
    wrapClientComponentLoader = logger.wrapClientComponentLoader
    finalizeClientComponentLoadTrackerOnStream =
      logger.finalizeClientComponentLoadTrackerOnStream
    finalizeClientComponentLoadTrackerOnPrerender =
      logger.finalizeClientComponentLoadTrackerOnPrerender
    finalizeClientComponentLoadTracker =
      logger.finalizeClientComponentLoadTracker

    const workStorage = await import('./app-render/work-async-storage.external')
    workAsyncStorage = workStorage.workAsyncStorage
  })

  afterEach(() => {
    getClientComponentLoaderMetrics({ reset: true })
    jest.restoreAllMocks()
  })

  it('tracks elapsed boundaries separately from sequential load time', () =>
    runWithTrackedWorkStore(() => {
      jest
        .spyOn(performance, 'now')
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(110)
        .mockReturnValueOnce(150)
        .mockReturnValueOnce(160)

      const loader = wrapClientComponentLoader(
        createComponentModule(
          () => undefined,
          async () => undefined
        )
      )

      loader.require('first')
      loader.require('second')

      expect(getClientComponentLoaderMetrics()).toEqual({
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 160,
        clientComponentLoadTimes: 20,
        clientComponentLoadCount: 2,
      })
    }))

  it('preserves accumulated load time for nested requires', () =>
    runWithTrackedWorkStore(() => {
      jest
        .spyOn(performance, 'now')
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(110)
        .mockReturnValueOnce(120)
        .mockReturnValueOnce(130)

      let loader: AppPageModule['__next_app__']
      loader = wrapClientComponentLoader(
        createComponentModule(
          (id) => {
            if (id === 'outer') {
              loader.require('inner')
            }
          },
          async () => undefined
        )
      )

      loader.require('outer')

      expect(getClientComponentLoaderMetrics()).toEqual({
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 130,
        clientComponentLoadTimes: 40,
        clientComponentLoadCount: 2,
      })
    }))

  it('tracks the last settlement across overlapping chunk loads', () =>
    runWithTrackedWorkStore(async () => {
      jest
        .spyOn(performance, 'now')
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(110)
        .mockReturnValueOnce(130)
        .mockReturnValueOnce(170)

      let resolveFirst!: () => void
      let resolveSecond!: () => void
      const first = new Promise<void>((resolve) => {
        resolveFirst = resolve
      })
      const second = new Promise<void>((resolve) => {
        resolveSecond = resolve
      })
      const loader = wrapClientComponentLoader(
        createComponentModule(
          () => undefined,
          (id) => (id === 'first' ? first : second)
        )
      )

      expect(loader.loadChunk('first')).toBe(first)
      expect(loader.loadChunk('second')).toBe(second)

      resolveSecond()
      await second
      expect(getClientComponentLoaderMetrics()).toEqual({
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 130,
        clientComponentLoadTimes: 20,
        clientComponentLoadCount: 0,
      })

      resolveFirst()
      await first
      expect(getClientComponentLoaderMetrics()).toEqual({
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 170,
        clientComponentLoadTimes: 90,
        clientComponentLoadCount: 0,
      })
    }))

  it('leaves the end boundary unset while a chunk load is pending', () =>
    runWithTrackedWorkStore(async () => {
      jest
        .spyOn(performance, 'now')
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(150)

      let resolveChunk!: () => void
      const chunk = new Promise<void>((resolve) => {
        resolveChunk = resolve
      })
      const loader = wrapClientComponentLoader(
        createComponentModule(
          () => undefined,
          () => chunk
        )
      )

      expect(loader.loadChunk('pending')).toBe(chunk)
      expect(getClientComponentLoaderMetrics()).toEqual({
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 0,
        clientComponentLoadTimes: 0,
        clientComponentLoadCount: 0,
      })

      resolveChunk()
      await chunk
      expect(getClientComponentLoaderMetrics()).toEqual({
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 150,
        clientComponentLoadTimes: 50,
        clientComponentLoadCount: 0,
      })
    }))

  it('tracks rejected chunk loads without changing the returned promise', () =>
    runWithTrackedWorkStore(async () => {
      jest
        .spyOn(performance, 'now')
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(150)

      const error = new Error('chunk failed')
      const chunk = Promise.reject(error)
      const loader = wrapClientComponentLoader(
        createComponentModule(
          () => undefined,
          () => chunk
        )
      )

      expect(loader.loadChunk('rejected')).toBe(chunk)
      await expect(chunk).rejects.toBe(error)
      expect(getClientComponentLoaderMetrics()).toEqual({
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 150,
        clientComponentLoadTimes: 50,
        clientComponentLoadCount: 0,
      })
    }))

  it('keeps metrics separate for interleaved render work stores', () => {
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(110)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(230)
      .mockReturnValueOnce(300)
      .mockReturnValueOnce(340)

    const firstWorkStore = createTrackedWorkStore('/first/page', '/first')
    const secondWorkStore = createTrackedWorkStore('/second/page', '/second')
    const loader = wrapClientComponentLoader(
      createComponentModule(
        () => undefined,
        async () => undefined
      )
    )

    workAsyncStorage.run(firstWorkStore, () => loader.require('first'))
    workAsyncStorage.run(secondWorkStore, () => loader.require('second'))
    workAsyncStorage.run(firstWorkStore, () => loader.require('first-again'))

    const firstMetrics = {
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 340,
      clientComponentLoadTimes: 50,
      clientComponentLoadCount: 2,
    }
    const secondMetrics = {
      clientComponentLoadStart: 200,
      clientComponentLoadEnd: 230,
      clientComponentLoadTimes: 30,
      clientComponentLoadCount: 1,
    }

    const observed = {
      first: workAsyncStorage.run(firstWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
      second: workAsyncStorage.run(secondWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
      resetFirst: workAsyncStorage.run(firstWorkStore, () =>
        getClientComponentLoaderMetrics({ reset: true })
      ),
      firstAfterReset: workAsyncStorage.run(firstWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
      secondAfterReset: workAsyncStorage.run(secondWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
    }

    expect(observed).toEqual({
      first: firstMetrics,
      second: secondMetrics,
      resetFirst: firstMetrics,
      firstAfterReset: undefined,
      secondAfterReset: secondMetrics,
    })
  })

  it('attributes a pending chunk settlement to its original render after another render resets', async () => {
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(220)
      .mockReturnValueOnce(300)

    let resolveChunk!: () => void
    const chunk = new Promise<void>((resolve) => {
      resolveChunk = resolve
    })
    const loader = wrapClientComponentLoader(
      createComponentModule(
        () => undefined,
        () => chunk
      )
    )
    const firstWorkStore = createTrackedWorkStore('/first/page', '/first')
    const secondWorkStore = createTrackedWorkStore('/second/page', '/second')

    expect(
      workAsyncStorage.run(firstWorkStore, () => loader.loadChunk('first'))
    ).toBe(chunk)
    workAsyncStorage.run(secondWorkStore, () => loader.require('second'))

    const secondAtReset = workAsyncStorage.run(secondWorkStore, () =>
      getClientComponentLoaderMetrics({ reset: true })
    )

    resolveChunk()
    await chunk

    const observed = {
      secondAtReset,
      firstAfterSettlement: workAsyncStorage.run(firstWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
      secondAfterSettlement: workAsyncStorage.run(secondWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
    }

    expect(observed).toEqual({
      secondAtReset: {
        clientComponentLoadStart: 200,
        clientComponentLoadEnd: 220,
        clientComponentLoadTimes: 20,
        clientComponentLoadCount: 1,
      },
      firstAfterSettlement: {
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 300,
        clientComponentLoadTimes: 200,
        clientComponentLoadCount: 0,
      },
      secondAfterSettlement: undefined,
    })
  })

  it("does not let an untouched render read or reset another render's metrics", () => {
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(130)

    const firstWorkStore = createTrackedWorkStore('/first/page', '/first')
    const untouchedWorkStore = createTrackedWorkStore(
      '/untouched/page',
      '/untouched'
    )
    const loader = wrapClientComponentLoader(
      createComponentModule(
        () => undefined,
        async () => undefined
      )
    )

    workAsyncStorage.run(firstWorkStore, () => loader.require('first'))

    const observed = {
      untouchedBeforeReset: workAsyncStorage.run(untouchedWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
      resetUntouched: workAsyncStorage.run(untouchedWorkStore, () =>
        getClientComponentLoaderMetrics({ reset: true })
      ),
      firstAfterReset: workAsyncStorage.run(firstWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
    }

    expect(observed).toEqual({
      untouchedBeforeReset: undefined,
      resetUntouched: undefined,
      firstAfterReset: {
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 130,
        clientComponentLoadTimes: 30,
        clientComponentLoadCount: 1,
      },
    })
  })

  it('keeps a throwing require and its timing in the originating render', () => {
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(130)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(240)
      .mockReturnValueOnce(300)
      .mockReturnValueOnce(320)

    const failure = new Error('require failed')
    const loader = wrapClientComponentLoader(
      createComponentModule(
        (id) => {
          if (id === 'throw') {
            throw failure
          }
        },
        async () => undefined
      )
    )
    const firstWorkStore = createTrackedWorkStore('/first/page', '/first')
    const secondWorkStore = createTrackedWorkStore('/second/page', '/second')

    let caught: unknown
    workAsyncStorage.run(firstWorkStore, () => {
      try {
        loader.require('throw')
      } catch (error) {
        caught = error
      }
    })
    workAsyncStorage.run(secondWorkStore, () => loader.require('second'))
    workAsyncStorage.run(firstWorkStore, () => loader.require('first-again'))

    const observed = {
      caught,
      first: workAsyncStorage.run(firstWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
      second: workAsyncStorage.run(secondWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
    }

    expect(observed).toEqual({
      caught: failure,
      first: {
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 320,
        clientComponentLoadTimes: 50,
        clientComponentLoadCount: 2,
      },
      second: {
        clientComponentLoadStart: 200,
        clientComponentLoadEnd: 240,
        clientComponentLoadTimes: 40,
        clientComponentLoadCount: 1,
      },
    })
  })

  it('isolates out-of-order chunk settlements and a rejection across renders', async () => {
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(110)
      .mockReturnValueOnce(120)
      .mockReturnValueOnce(130)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(210)
      .mockReturnValueOnce(220)
      .mockReturnValueOnce(230)

    let resolveSlow!: () => void
    let resolveFast!: () => void
    let resolveLate!: () => void
    let rejectFailed!: (error: Error) => void
    const slow = new Promise<void>((resolve) => {
      resolveSlow = resolve
    })
    const fast = new Promise<void>((resolve) => {
      resolveFast = resolve
    })
    const late = new Promise<void>((resolve) => {
      resolveLate = resolve
    })
    const failed = new Promise<void>((_resolve, reject) => {
      rejectFailed = reject
    })
    const loader = wrapClientComponentLoader(
      createComponentModule(
        () => undefined,
        (id) => {
          switch (id) {
            case 'slow':
              return slow
            case 'fast':
              return fast
            case 'late':
              return late
            case 'failed':
              return failed
            default:
              throw new Error(`Unexpected chunk: ${id}`)
          }
        }
      )
    )
    const firstWorkStore = createTrackedWorkStore('/first/page', '/first')
    const secondWorkStore = createTrackedWorkStore('/second/page', '/second')

    workAsyncStorage.run(firstWorkStore, () => loader.loadChunk('slow'))
    const failedResult = workAsyncStorage.run(secondWorkStore, () =>
      loader.loadChunk('failed')
    )
    const failureOutcome = failedResult.then(
      () => undefined,
      (reason) => reason
    )
    workAsyncStorage.run(firstWorkStore, () => loader.loadChunk('fast'))
    workAsyncStorage.run(secondWorkStore, () => loader.loadChunk('late'))

    resolveFast()
    await fast
    resolveLate()
    await late
    const failure = new Error('chunk failed')
    rejectFailed(failure)
    const rejectionReason = await failureOutcome

    const firstBeforeSlowSettlement = workAsyncStorage.run(firstWorkStore, () =>
      getClientComponentLoaderMetrics()
    )
    const secondAtReset = workAsyncStorage.run(secondWorkStore, () =>
      getClientComponentLoaderMetrics({ reset: true })
    )

    resolveSlow()
    await slow

    const observed = {
      rejectionReason,
      firstBeforeSlowSettlement,
      secondAtReset,
      firstAfterSlowSettlement: workAsyncStorage.run(firstWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
      secondAfterReset: workAsyncStorage.run(secondWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
    }

    expect(observed).toEqual({
      rejectionReason: failure,
      firstBeforeSlowSettlement: {
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 200,
        clientComponentLoadTimes: 80,
        clientComponentLoadCount: 0,
      },
      secondAtReset: {
        clientComponentLoadStart: 110,
        clientComponentLoadEnd: 220,
        clientComponentLoadTimes: 190,
        clientComponentLoadCount: 0,
      },
      firstAfterSlowSettlement: {
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 230,
        clientComponentLoadTimes: 210,
        clientComponentLoadCount: 0,
      },
      secondAfterReset: undefined,
    })
  })

  it('tracks each render separately when both wait for the same chunk promise', async () => {
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(160)
      .mockReturnValueOnce(250)
      .mockReturnValueOnce(260)

    let resolveChunk!: () => void
    const chunk = new Promise<void>((resolve) => {
      resolveChunk = resolve
    })
    const loader = wrapClientComponentLoader(
      createComponentModule(
        () => undefined,
        () => chunk
      )
    )
    const firstWorkStore = createTrackedWorkStore('/first/page', '/first')
    const secondWorkStore = createTrackedWorkStore('/second/page', '/second')

    const firstResult = workAsyncStorage.run(firstWorkStore, () =>
      loader.loadChunk('shared')
    )
    const secondResult = workAsyncStorage.run(secondWorkStore, () =>
      loader.loadChunk('shared')
    )

    resolveChunk()
    await chunk

    const observed = {
      firstReturnedOriginalPromise: firstResult === chunk,
      secondReturnedOriginalPromise: secondResult === chunk,
      first: workAsyncStorage.run(firstWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
      second: workAsyncStorage.run(secondWorkStore, () =>
        getClientComponentLoaderMetrics()
      ),
    }

    expect(observed).toEqual({
      firstReturnedOriginalPromise: true,
      secondReturnedOriginalPromise: true,
      first: {
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 250,
        clientComponentLoadTimes: 150,
        clientComponentLoadCount: 0,
      },
      second: {
        clientComponentLoadStart: 160,
        clientComponentLoadEnd: 260,
        clientComponentLoadTimes: 100,
        clientComponentLoadCount: 0,
      },
    })
  })

  it('passes through when no render tracker is present', async () => {
    const now = jest.spyOn(performance, 'now')
    const moduleValue = { id: 'module' }
    const chunk = Promise.resolve()
    const loader = wrapClientComponentLoader(
      createComponentModule(
        () => moduleValue,
        () => chunk
      )
    )
    const untrackedWorkStore = {
      page: '/untracked/page',
      route: '/untracked',
      clientComponentLoadTracker: undefined,
    } as WorkStore

    const withoutWorkStore = workAsyncStorage.exit(() => ({
      module: loader.require('module'),
      chunk: loader.loadChunk('chunk'),
      metrics: getClientComponentLoaderMetrics(),
    }))
    const withoutTracker = workAsyncStorage.run(untrackedWorkStore, () => ({
      module: loader.require('module'),
      chunk: loader.loadChunk('chunk'),
      metrics: getClientComponentLoaderMetrics(),
    }))
    await chunk

    expect({
      noWorkStoreModuleIdentity: withoutWorkStore.module === moduleValue,
      noWorkStoreChunkIdentity: withoutWorkStore.chunk === chunk,
      noWorkStoreMetrics: withoutWorkStore.metrics,
      noTrackerModuleIdentity: withoutTracker.module === moduleValue,
      noTrackerChunkIdentity: withoutTracker.chunk === chunk,
      noTrackerMetrics: withoutTracker.metrics,
      clockCalls: now.mock.calls.length,
    }).toEqual({
      noWorkStoreModuleIdentity: true,
      noWorkStoreChunkIdentity: true,
      noWorkStoreMetrics: undefined,
      noTrackerModuleIdentity: true,
      noTrackerChunkIdentity: true,
      noTrackerMetrics: undefined,
      clockCalls: 0,
    })
  })

  it('seals once after all pending chunks settle', async () => {
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(150)

    let resolveChunk!: () => void
    const chunk = new Promise<void>((resolve) => {
      resolveChunk = resolve
    })
    const loader = wrapClientComponentLoader(
      createComponentModule(
        () => undefined,
        () => chunk
      )
    )
    const tracker = new ClientComponentLoadTracker()
    const workStore = {
      page: '/test/page',
      route: '/test',
      clientComponentLoadTracker: tracker,
    } as WorkStore

    workAsyncStorage.run(workStore, () => loader.loadChunk('pending'))

    const completion = tracker.seal()
    const sameCompletion = tracker.seal()
    let completionCount = 0
    completion.then(() => {
      completionCount++
    })
    await Promise.resolve()
    const completionCountBeforeSettlement = completionCount

    resolveChunk()
    await chunk
    const finalized = await completion
    const finalizedAgain = await tracker.seal()

    const expectedMetrics = {
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 150,
      clientComponentLoadTimes: 50,
      clientComponentLoadCount: 0,
    }
    expect({
      sameCompletion: completion === sameCompletion,
      completionCountBeforeSettlement,
      completionCount,
      finalized,
      finalizedAgain,
    }).toEqual({
      sameCompletion: true,
      completionCountBeforeSettlement: 0,
      completionCount: 1,
      finalized: expectedMetrics,
      finalizedAgain: expectedMetrics,
    })
  })

  it('finishes tracking when a chunk loader throws synchronously', async () => {
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(140)

    const failure = new Error('chunk loader failed')
    const loader = wrapClientComponentLoader(
      createComponentModule(
        () => undefined,
        () => {
          throw failure
        }
      )
    )
    const tracker = new ClientComponentLoadTracker()
    const workStore = {
      page: '/test/page',
      route: '/test',
      clientComponentLoadTracker: tracker,
    } as WorkStore

    let caught: unknown
    workAsyncStorage.run(workStore, () => {
      try {
        loader.loadChunk('failed')
      } catch (error) {
        caught = error
      }
    })

    const completion = tracker.seal()
    let didFinish = false
    completion.then(() => {
      didFinish = true
    })
    await Promise.resolve()
    const finalized = didFinish ? await completion : undefined

    expect({ caught, didFinish, finalized }).toEqual({
      caught: failure,
      didFinish: true,
      finalized: {
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 140,
        clientComponentLoadTimes: 40,
        clientComponentLoadCount: 0,
      },
    })
  })

  it('keeps snapshots stable and stops tracking new loads after sealing', async () => {
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(130)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(240)

    const loader = wrapClientComponentLoader(
      createComponentModule(
        () => undefined,
        async () => undefined
      )
    )
    const tracker = new ClientComponentLoadTracker()
    const workStore = {
      page: '/test/page',
      route: '/test',
      clientComponentLoadTracker: tracker,
    } as WorkStore

    workAsyncStorage.run(workStore, () => loader.require('first'))
    const earlierSnapshot = tracker.snapshot()
    workAsyncStorage.run(workStore, () => loader.require('second'))
    const finalized = await tracker.seal()
    workAsyncStorage.run(workStore, () => loader.require('after-seal'))
    await workAsyncStorage.run(workStore, () => loader.loadChunk('after-seal'))

    const finalMetrics = {
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 240,
      clientComponentLoadTimes: 70,
      clientComponentLoadCount: 2,
    }
    expect({
      earlierSnapshot,
      finalized,
      trackerSnapshot: tracker.snapshot(),
      workStoreSnapshot: workAsyncStorage.run(workStore, () =>
        getClientComponentLoaderMetrics()
      ),
    }).toEqual({
      earlierSnapshot: {
        clientComponentLoadStart: 100,
        clientComponentLoadEnd: 130,
        clientComponentLoadTimes: 30,
        clientComponentLoadCount: 1,
      },
      finalized: finalMetrics,
      trackerSnapshot: finalMetrics,
      workStoreSnapshot: finalMetrics,
    })
  })

  it('finalizes a dynamic render when its Web Stream completes', async () => {
    const tracker = new ClientComponentLoadTracker()
    tracker.beginRequire(100)
    tracker.finishRequire(100, 120)
    let resolveReport!: () => void
    const reported = new Promise<void>((resolve) => {
      resolveReport = resolve
    })
    const report = jest.fn(() => resolveReport())
    let sourceController!: ReadableStreamDefaultController<Uint8Array>
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        sourceController = controller
      },
    })

    const output = finalizeClientComponentLoadTrackerOnStream(
      source,
      tracker,
      report
    )
    const reader = output.getReader()
    sourceController.enqueue(new Uint8Array([1]))
    expect(await reader.read()).toEqual({
      done: false,
      value: new Uint8Array([1]),
    })
    expect(tracker.isSealed()).toBe(false)
    sourceController.close()
    expect(await reader.read()).toEqual({ done: true, value: undefined })
    await reported

    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith({
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 120,
      clientComponentLoadTimes: 20,
      clientComponentLoadCount: 1,
    })
  })

  it.each(['error', 'cancel'] as const)(
    'finalizes a dynamic render on stream %s',
    async (termination) => {
      const tracker = new ClientComponentLoadTracker()
      tracker.beginRequire(100)
      tracker.finishRequire(100, 120)
      let resolveReport!: () => void
      const reported = new Promise<void>((resolve) => {
        resolveReport = resolve
      })
      const report = jest.fn(() => resolveReport())
      let sourceController!: ReadableStreamDefaultController<Uint8Array>
      const source = new ReadableStream<Uint8Array>({
        start(controller) {
          sourceController = controller
        },
      })
      const output = finalizeClientComponentLoadTrackerOnStream(
        source,
        tracker,
        report
      )
      const reader = output.getReader()

      if (termination === 'error') {
        const error = new Error('render stream failed')
        sourceController.error(error)
        await expect(reader.read()).rejects.toBe(error)
      } else {
        await reader.cancel('consumer stopped')
      }
      await reported

      expect(report).toHaveBeenCalledTimes(1)
      expect(tracker.isSealed()).toBe(true)
    }
  )

  it.each(['success', 'error'] as const)(
    'finalizes a prerender on %s before returning to its caller',
    async (outcome) => {
      const tracker = new ClientComponentLoadTracker()
      tracker.beginRequire(100)
      tracker.finishRequire(100, 120)
      const report = jest.fn()
      const error = new Error('prerender failed')
      const operation = async () => {
        expect(tracker.isSealed()).toBe(false)
        if (outcome === 'error') throw error
        return 'prerendered'
      }

      const result = finalizeClientComponentLoadTrackerOnPrerender(
        operation,
        tracker,
        report
      )
      if (outcome === 'error') {
        await expect(result).rejects.toBe(error)
      } else {
        await expect(result).resolves.toBe('prerendered')
      }

      expect(tracker.isSealed()).toBe(true)
      await tracker.seal()
      expect(report).toHaveBeenCalledTimes(1)
    }
  )

  it('seals a prerender when it returns an open stream without wrapping it', async () => {
    const tracker = new ClientComponentLoadTracker()
    tracker.beginRequire(100)
    tracker.finishRequire(100, 120)
    const report = jest.fn()
    let sourceController!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        sourceController = controller
      },
    })

    const returned = await finalizeClientComponentLoadTrackerOnPrerender(
      async () => stream,
      tracker,
      report
    )

    expect(returned).toBe(stream)
    expect(stream.locked).toBe(false)
    expect(tracker.isSealed()).toBe(true)
    expect(report).toHaveBeenCalledTimes(1)
    sourceController.close()
  })

  it('reports pending loads once after finalization without extending the stream', async () => {
    const tracker = new ClientComponentLoadTracker()
    tracker.beginChunk(100)
    let resolveReport!: () => void
    const reported = new Promise<void>((resolve) => {
      resolveReport = resolve
    })
    const report = jest.fn(() => resolveReport())
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })
    const output = finalizeClientComponentLoadTrackerOnStream(
      source,
      tracker,
      report
    )

    await output.getReader().read()
    // The render is over, but a load started during it may settle later.
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(tracker.isSealed()).toBe(true)
    expect(report).not.toHaveBeenCalled()

    finalizeClientComponentLoadTracker(tracker, report)
    tracker.finishChunk(100, 120)
    await reported
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith({
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 120,
      clientComponentLoadTimes: 20,
      clientComponentLoadCount: 0,
    })
  })

  it('handles a detached client component metrics reporter throwing', async () => {
    const tracker = new ClientComponentLoadTracker()
    tracker.beginRequire(100)
    tracker.finishRequire(100, 110)
    const error = new Error('metrics reporter failed')
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    try {
      finalizeClientComponentLoadTracker(tracker, () => {
        throw error
      })
      await Promise.resolve()
      await Promise.resolve()
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to report client component loading metrics:',
        error
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
