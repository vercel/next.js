import 'next/dist/server/node-environment-baseline'
import { installGlobalModuleLoadingHandlers } from 'next/dist/server/app-render/install-module-loading'
import { CacheSignal } from 'next/dist/server/app-render/cache-signal'

const runtime = globalThis as typeof globalThis & {
  __next_require__?: (id: string | number) => unknown
  __next_chunk_load__?: (id: string | number) => Promise<unknown>
}

describe('shared module loading installation', () => {
  const originalRequire = runtime.__next_require__
  const originalLoad = runtime.__next_chunk_load__
  const originalDevServer = process.env.__NEXT_DEV_SERVER

  afterEach(() => {
    runtime.__next_require__ = originalRequire
    runtime.__next_chunk_load__ = originalLoad
    if (originalDevServer === undefined) {
      delete process.env.__NEXT_DEV_SERVER
    } else {
      process.env.__NEXT_DEV_SERVER = originalDevServer
    }
    jest.restoreAllMocks()
  })

  it.each([false, true])(
    'preserves loader identities and tracks development imports with cacheComponents=%s',
    async (cacheComponents) => {
      process.env.__NEXT_DEV_SERVER = 'true'
      const exports = Promise.resolve({ default: 'component' })
      const chunk = Promise.resolve()
      const require = jest.fn(() => exports)
      const loadChunk = jest.fn(() => chunk)
      const trackRead = jest.spyOn(CacheSignal.prototype, 'trackRead')
      installGlobalModuleLoadingHandlers(
        { __next_app__: { require, loadChunk } },
        cacheComponents,
        false
      )
      expect(runtime.__next_require__!('component')).toBe(exports)
      expect(runtime.__next_chunk_load__!('chunk')).toBe(chunk)
      expect(require).toHaveBeenCalledWith('component')
      expect(loadChunk).toHaveBeenCalledWith('chunk')
      expect(trackRead).toHaveBeenCalledTimes(cacheComponents ? 2 : 0)
      if (cacheComponents) {
        expect(trackRead).toHaveBeenCalledWith(exports)
        expect(trackRead).toHaveBeenCalledWith(chunk)
      }
      await Promise.all([exports, chunk])
    }
  )

  it('does not track imports outside a work-unit scope in production', async () => {
    delete process.env.__NEXT_DEV_SERVER
    const chunk = Promise.resolve()
    const trackRead = jest.spyOn(CacheSignal.prototype, 'trackRead')
    installGlobalModuleLoadingHandlers(
      {
        __next_app__: {
          require: () => 'component',
          loadChunk: () => chunk,
        },
      },
      true,
      false
    )
    expect(runtime.__next_require__!('component')).toBe('component')
    expect(runtime.__next_chunk_load__!('chunk')).toBe(chunk)
    expect(trackRead).not.toHaveBeenCalled()
    await chunk
  })
})
