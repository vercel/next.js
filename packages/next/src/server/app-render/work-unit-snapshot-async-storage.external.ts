import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
import { _workUnitSnapshotAsyncStorage as workUnitSnapshotAsyncStorage } from './work-unit-snapshot-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
import type { WorkUnitStore } from './work-unit-async-storage.external'

export interface WorkUnitSnapshotStore {
  readonly phase: WorkUnitStore['phase']
}

export type WorkUnitSnapshotAsyncStorage =
  AsyncLocalStorage<WorkUnitSnapshotStore>

export { workUnitSnapshotAsyncStorage }
