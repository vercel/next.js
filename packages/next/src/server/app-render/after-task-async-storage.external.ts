import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
import { afterTaskAsyncStorageInstance as afterTaskAsyncStorage } from './after-task-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
import type { WorkUnitStore } from './work-unit-async-storage.external'

export type ErrorLike = { stack?: string }

export interface AfterTaskStore {
  /** The phase in which the topmost `after` was called.
   *
   * NOTE: Can be undefined when running `generateStaticParams`,
   * where we only have a `workStore`, no `workUnitStore`.
   */
  readonly rootTaskSpawnPhase: WorkUnitStore['phase'] | undefined
  readonly rootTaskReactOwnerStack: string | null
  readonly rootTaskCallerStack: ErrorLike
  readonly nestedTaskCallerStacks: ErrorLike[] | undefined
}

export type AfterTaskAsyncStorage = AsyncLocalStorage<AfterTaskStore>

export { afterTaskAsyncStorage }
