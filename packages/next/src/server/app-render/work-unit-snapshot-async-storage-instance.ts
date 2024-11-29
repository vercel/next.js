import type { WorkUnitSnapshotAsyncStorage } from './work-unit-snapshot-async-storage.external'
import { createAsyncLocalStorage } from './async-local-storage'

export const _workUnitSnapshotAsyncStorage: WorkUnitSnapshotAsyncStorage =
  createAsyncLocalStorage()
