/** @jest-environment jsdom */

import { createRouteLoader, isAssetError, markAssetError } from './route-loader'

const mockResolvePromiseWithTimeout = jest.fn()

jest.mock('./lib/promise', () => ({
  resolvePromiseWithTimeout: (...args: unknown[]) =>
    mockResolvePromiseWithTimeout(...args),
}))

const route = '/test-route'
const component = () => null
const loadedRoute = {
  entrypoint: { component, exports: {} },
  styles: [],
}

async function createLoader() {
  window.__BUILD_MANIFEST = { [route]: [] }
  const loader = createRouteLoader('')
  const entrypoint = loader.whenEntrypoint(route)
  loader.onEntrypoint(route, () => ({ default: component }))
  await entrypoint
  return loader
}

describe('createRouteLoader', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('retries navigation after a joined prefetch fails', async () => {
    const error = new Error('prefetch failed')
    mockResolvePromiseWithTimeout
      .mockImplementationOnce(() => Promise.reject(error))
      .mockImplementationOnce(() => Promise.resolve(loadedRoute))

    const loader = await createLoader()
    const prefetch = loader.loadRoute(route, true)
    const navigation = loader.loadRoute(route)

    await expect(prefetch).rejects.toBe(error)
    await expect(navigation).resolves.toMatchObject({
      component,
      styles: [],
    })
    expect(mockResolvePromiseWithTimeout).toHaveBeenCalledTimes(2)
  })

  it('settles the shared future when the generator throws synchronously', async () => {
    const error = new Error('synchronous prefetch failure')
    mockResolvePromiseWithTimeout
      .mockImplementationOnce(() => {
        throw error
      })
      .mockImplementationOnce(() => Promise.resolve(loadedRoute))

    const loader = await createLoader()

    await expect(loader.loadRoute(route, true)).rejects.toBe(error)
    await expect(loader.loadRoute(route)).resolves.toMatchObject({
      component,
      styles: [],
    })
    expect(mockResolvePromiseWithTimeout).toHaveBeenCalledTimes(2)
  })

  it('handles a failed prefetch when no navigation joins it', async () => {
    const error = new Error('unjoined prefetch failed')
    mockResolvePromiseWithTimeout.mockImplementationOnce(() =>
      Promise.reject(error)
    )

    const loader = await createLoader()
    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown) =>
      unhandledRejections.push(reason)
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      await expect(loader.loadRoute(route, true)).rejects.toBe(error)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandledRejections).toEqual([])
    } finally {
      process.removeListener('unhandledRejection', onUnhandledRejection)
    }
  })

  it('returns a retry error for the existing hard-navigation fallback', async () => {
    const prefetchError = new Error('prefetch failed')
    const retryError = markAssetError(new Error('retry failed'))
    mockResolvePromiseWithTimeout
      .mockImplementationOnce(() => Promise.reject(prefetchError))
      .mockImplementationOnce(() => Promise.reject(retryError))

    const loader = await createLoader()
    const prefetch = loader.loadRoute(route, true)
    const navigation = loader.loadRoute(route)

    await expect(prefetch).rejects.toBe(prefetchError)
    const result = await navigation
    expect('error' in result).toBe(true)
    if (!('error' in result) || !(result.error instanceof Error)) {
      throw new Error('Expected route load to return its retry error')
    }
    expect(result.error).toBe(retryError)
    expect(isAssetError(result.error)).toBe(true)
    expect(mockResolvePromiseWithTimeout).toHaveBeenCalledTimes(2)
  })
})
