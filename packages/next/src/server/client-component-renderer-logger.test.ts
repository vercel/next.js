import { AsyncLocalStorage } from 'async_hooks'
import type { AppPageModule } from './route-modules/app-page/module'
import type { WorkStore } from './app-render/work-async-storage.external'

type LoggerMod = typeof import('./client-component-renderer-logger')
type WASMod = typeof import('./app-render/work-async-storage.external')

let ClientComponentLoadTracker: LoggerMod['ClientComponentLoadTracker']
let getClientComponentLoaderMetrics: LoggerMod['getClientComponentLoaderMetrics']
let wrapClientComponentLoader: LoggerMod['wrapClientComponentLoader']
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

  it('attributes a pending chunk to its render while another render runs', async () => {
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
    resolveChunk()
    await chunk

    expect(
      workAsyncStorage.run(firstWorkStore, () =>
        getClientComponentLoaderMetrics()
      )
    ).toEqual({
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 300,
      clientComponentLoadTimes: 200,
      clientComponentLoadCount: 0,
    })
    expect(
      workAsyncStorage.run(secondWorkStore, () =>
        getClientComponentLoaderMetrics()
      )
    ).toEqual({
      clientComponentLoadStart: 200,
      clientComponentLoadEnd: 220,
      clientComponentLoadTimes: 20,
      clientComponentLoadCount: 1,
    })
  })

  it('finishes once and ignores loads started afterward', async () => {
    const report = jest.fn()
    const tracker = new ClientComponentLoadTracker(report)
    tracker.beginRequire(100)
    tracker.finishRequire(100, 120)
    tracker.finish()
    tracker.finish()

    const workStore = createTrackedWorkStore()
    workStore.clientComponentLoadTracker = tracker
    const loader = wrapClientComponentLoader(
      createComponentModule(
        () => undefined,
        async () => undefined
      )
    )
    workAsyncStorage.run(workStore, () => loader.require('after-finish'))
    await Promise.resolve()

    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith({
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 120,
      clientComponentLoadTimes: 20,
      clientComponentLoadCount: 1,
    })
  })

  it('reports once after every pending chunk settles', async () => {
    let resolveReport!: () => void
    const reported = new Promise<void>((resolve) => {
      resolveReport = resolve
    })
    const report = jest.fn(() => resolveReport())
    const tracker = new ClientComponentLoadTracker(report)
    tracker.beginChunk(100)
    tracker.beginChunk(110)
    tracker.finish()
    await Promise.resolve()
    expect(report).not.toHaveBeenCalled()

    tracker.finishChunk(110, 130)
    await Promise.resolve()
    expect(report).not.toHaveBeenCalled()

    tracker.finishChunk(100, 170)
    await reported
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith({
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 170,
      clientComponentLoadTimes: 90,
      clientComponentLoadCount: 0,
    })
  })
})
