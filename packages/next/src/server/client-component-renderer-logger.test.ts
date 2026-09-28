import type { AppPageModule } from './route-modules/app-page/module'
import {
  getClientComponentLoaderMetrics,
  wrapClientComponentLoader,
} from './client-component-renderer-logger'

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

describe('client component renderer logger', () => {
  afterEach(() => {
    getClientComponentLoaderMetrics({ reset: true })
    jest.restoreAllMocks()
  })

  it('tracks elapsed boundaries separately from sequential load time', () => {
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
      ),
      true
    )

    loader.require('first')
    loader.require('second')

    expect(getClientComponentLoaderMetrics()).toEqual({
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 160,
      clientComponentLoadTimes: 20,
      clientComponentLoadCount: 2,
    })
  })

  it('preserves accumulated load time for nested requires', () => {
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
      ),
      true
    )

    loader.require('outer')

    expect(getClientComponentLoaderMetrics()).toEqual({
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 130,
      clientComponentLoadTimes: 40,
      clientComponentLoadCount: 2,
    })
  })

  it('tracks the last settlement across overlapping chunk loads', async () => {
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
      ),
      true
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
  })

  it('leaves the end boundary unset while a chunk load is pending', async () => {
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
      ),
      true
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
  })

  it('tracks rejected chunk loads without changing the returned promise', async () => {
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
      ),
      true
    )

    expect(loader.loadChunk('rejected')).toBe(chunk)
    await expect(chunk).rejects.toBe(error)
    expect(getClientComponentLoaderMetrics()).toEqual({
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 150,
      clientComponentLoadTimes: 50,
      clientComponentLoadCount: 0,
    })
  })
})
