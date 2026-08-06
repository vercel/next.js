import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
import { dynamicAccessAsyncStorageInstance } from './dynamic-access-async-storage-instance' with { 'turbopack-transition': 'next-shared' }

export interface DynamicAccessAsyncStore {
  readonly abortController: AbortController
}

export type DynamicAccessStorage = AsyncLocalStorage<DynamicAccessAsyncStore>
export { dynamicAccessAsyncStorageInstance as dynamicAccessAsyncStorage }
