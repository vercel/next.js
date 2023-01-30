import type { AsyncLocalStorage } from 'async_hooks'

/**
 *
 */
export interface AsyncStorageWrapper<Store extends {}, Context extends {}> {
  wrap<Result>(
    storage: AsyncLocalStorage<Store>,
    context: Context,
    callback: () => Result
  ): Result
}
