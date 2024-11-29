import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
import { _afterTaskAsyncStorage as afterTaskAsyncStorage } from './after-task-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
import type { WorkUnitStore } from './work-unit-async-storage.external'

export interface AfterTaskStore {
  readonly phase: WorkUnitStore['phase']
}

export type AfterTaskAsyncStorage = AsyncLocalStorage<AfterTaskStore>

export { afterTaskAsyncStorage }
