import type { AsyncLocalStorage } from 'async_hooks'
// Share the instance module in the next-shared layer
import { _lifecycleAsyncStorage as lifecycleAsyncStorage } from './lifecycle-async-storage-instance' with { 'turbopack-transition': 'next-shared' }

export interface LifecycleStore {
  readonly waitUntil: ((promise: Promise<any>) => void) | undefined
}

export type LifecycleAsyncStorage = AsyncLocalStorage<LifecycleStore>

export { lifecycleAsyncStorage }
