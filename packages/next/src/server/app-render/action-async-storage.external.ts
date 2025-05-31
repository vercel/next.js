import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
import { actionAsyncStorageInstance } from './action-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
export interface ActionStore {
  readonly isAction?: boolean
  readonly isAppRoute?: boolean
}

export type ActionAsyncStorage = AsyncLocalStorage<ActionStore>

export { actionAsyncStorageInstance as actionAsyncStorage }
