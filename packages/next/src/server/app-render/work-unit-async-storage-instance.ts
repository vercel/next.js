import { createAsyncLocalStorage } from './async-local-storage'
import type { WorkUnitAsyncStorage } from './work-unit-async-storage.external'

export const workUnitAsyncStorageInstance: WorkUnitAsyncStorage =
  createAsyncLocalStorage()
