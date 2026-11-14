import { AsyncLocalStorage } from 'async_hooks'
import type { AppPageModule } from '../route-modules/app-page/module'
import type { WorkStore } from './work-async-storage.external'

type HandlersMod = typeof import('./install-global-module-loading-handlers')
type LoggerMod = typeof import('../client-component-renderer-logger')
type WASMod = typeof import('./work-async-storage.external')

let installGlobalModuleLoadingHandlers: HandlersMod['installGlobalModuleLoadingHandlers']
let ClientComponentLoadTracker: LoggerMod['ClientComponentLoadTracker']
let workAsyncStorage: WASMod['workAsyncStorage']

function loadChunk(id: string): Promise<unknown> {
  // @ts-expect-error
  return globalThis.__next_chunk_load__(id)
}

describe('installGlobalModuleLoadingHandlers', () => {
  beforeAll(async () => {
    // AsyncLocalStorage must be available before workAsyncStorage is imported.
    // @ts-expect-error
    globalThis.AsyncLocalStorage = AsyncLocalStorage

    const handlers = await import('./install-global-module-loading-handlers')
    installGlobalModuleLoadingHandlers =
      handlers.installGlobalModuleLoadingHandlers
    const logger = await import('../client-component-renderer-logger')
    ClientComponentLoadTracker = logger.ClientComponentLoadTracker
    const workStorage = await import('./work-async-storage.external')
    workAsyncStorage = workStorage.workAsyncStorage
  })

  it('sends loads of a settled chunk through the tracker of a render that measures them', async () => {
    const bundlerLoadChunk = jest.fn((_id: string) => Promise.resolve())
    const ComponentMod = {
      __next_app__: { require: jest.fn(), loadChunk: bundlerLoadChunk },
    } as unknown as AppPageModule
    installGlobalModuleLoadingHandlers(ComponentMod, false)

    // An untracked render loads the chunk; later untracked loads reuse it.
    const first = loadChunk('chunk-a')
    await first
    expect(loadChunk('chunk-a')).toBe(first)
    expect(bundlerLoadChunk).toHaveBeenCalledTimes(1)

    // A render that measures client component loading sees every load.
    const tracker = new ClientComponentLoadTracker()
    await workAsyncStorage.run(
      { clientComponentLoadTracker: tracker } as WorkStore,
      async () => {
        await loadChunk('chunk-a')
        await loadChunk('chunk-a')
      }
    )
    expect(bundlerLoadChunk).toHaveBeenCalledTimes(3)
    expect(tracker.snapshot()).toBeDefined()

    // Once it is sealed, loads are reused again.
    tracker.finish()
    await workAsyncStorage.run(
      { clientComponentLoadTracker: tracker } as WorkStore,
      async () => {
        expect(loadChunk('chunk-a')).toBe(first)
      }
    )
    expect(bundlerLoadChunk).toHaveBeenCalledTimes(3)
  })
})
