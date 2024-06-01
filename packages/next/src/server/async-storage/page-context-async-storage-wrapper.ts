import type { AsyncStorageWrapper } from './async-storage-wrapper'
import type { PageStore } from '../../client/components/page-context-async-storage.external'
import type { AsyncLocalStorage } from 'async_hooks'

type PageContext = { [key: string]: unknown }

export const PageContextAsyncStorageWrapper: AsyncStorageWrapper<
  PageStore,
  PageContext
> = {
  wrap<Result>(
    storage: AsyncLocalStorage<PageStore>,
    ctx: PageContext,
    callback: (store: PageStore) => Result
  ): Result {
    // renderOpts.params
    const store: PageStore = ctx

    return storage.run(store, callback, store)
  },
}
