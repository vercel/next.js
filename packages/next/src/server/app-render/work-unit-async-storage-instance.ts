import { createAsyncLocalStorage } from '../../client/components/async-local-storage'
import type { WorkUnitAsyncStorage } from './work-unit-async-storage.external'

export const workUnitAsyncStorage: WorkUnitAsyncStorage =
  createAsyncLocalStorage()
