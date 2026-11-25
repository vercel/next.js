import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
import { dynamicAccessAsyncStorageInstance } from './dynamic-access-async-storage-instance' with { 'turbopack-transition': 'next-shared' }

export interface DynamicAccessAsyncStore {
  readonly abortController: AbortController
  reason: DynamicAccessReason | null
}

export type DynamicAccessReason = 'fallback-params' | 'runtime'

export type DynamicAccessStorage = AsyncLocalStorage<DynamicAccessAsyncStore>
export { dynamicAccessAsyncStorageInstance as dynamicAccessAsyncStorage }

export function abortOnDynamicAccess(
  reason: DynamicAccessReason,
  error: Error
) {
  const store = dynamicAccessAsyncStorageInstance.getStore()
  if (store !== undefined) {
    // A cache may read both kinds of data before cancellation finishes. Only
    // fallback-only dependencies can become static when the params are known.
    if (store.reason !== 'runtime') {
      store.reason = reason
    }
    store.abortController.abort(error)
  }
}
