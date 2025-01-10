import type { AsyncLocalStorage } from 'async_hooks'

/**
 * Implementations provide a wrapping function that will provide the storage to
 * async calls derived from the provided callback function.
 *
 * @param storage underlying storage object
 * @param context context used to create the storage object
 * @param callback function to call within the scope of the storage
 * @returns the result of the callback
 */
export type WithStore<Store extends {}, Context extends {}> = <Result>(
  storage: AsyncLocalStorage<Store>,
  context: Context,
  callback: (store: Store) => Result
) => Result
