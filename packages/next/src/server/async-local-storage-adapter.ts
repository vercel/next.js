import type { AsyncLocalStorage } from 'async_hooks'

export class AsyncLocalStorageAdapter<Store extends {}> {
  private readonly storage: AsyncLocalStorage<Store> | undefined
  private store: Store | undefined = undefined

  constructor() {
    // @ts-expect-error we provide this on globalThis in the edge runtime
    if (globalThis.AsyncLocalStorage) {
      this.storage = new (globalThis as any).AsyncLocalStorage()
    }
  }

  public get inUse(): boolean | null {
    if (this.storage) {
      return null
    }

    return this.store !== undefined
  }

  public getStore(): Store | undefined {
    if (this.storage) {
      return this.storage.getStore()
    }

    return this.store
  }

  public async run<Result>(
    store: Store,
    callback: () => Result
  ): Promise<Result> {
    if (this.storage) {
      return await this.storage.run(store, callback)
    }

    // If the store is already defined, then a run is already in progress, this
    // would conflict and override the store. Throw an error here to ensure that
    // we do not cause a race condition.
    if (this.store) {
      throw new Error(
        `Invariant: A separate worker must be used for each render when AsyncLocalStorage is not available`
      )
    }

    this.store = store

    let result: Result
    try {
      result = await callback()
    } finally {
      this.store = undefined
    }

    return result
  }
}
