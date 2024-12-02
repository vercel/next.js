import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
import { _afterTaskAsyncStorage as afterTaskAsyncStorage } from './after-task-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
import type { WorkUnitStore } from './work-unit-async-storage.external'

export interface AfterTaskStore {
  /** The phase in which the topmost `unstable_after` was called.
   *
   * NOTE: Can be undefined when running `generateStaticParams`,
   * where we only have a `workStore`, no `workUnitStore`.
   */
  readonly rootTaskSpawnPhase: WorkUnitStore['phase'] | undefined
}

export type AfterTaskAsyncStorage = AsyncLocalStorage<AfterTaskStore>

export { afterTaskAsyncStorage }
