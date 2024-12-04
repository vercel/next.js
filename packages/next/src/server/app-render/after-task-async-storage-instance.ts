import type { AfterTaskAsyncStorage } from './after-task-async-storage.external'
import { createAsyncLocalStorage } from './async-local-storage'

export const afterTaskAsyncStorageInstance: AfterTaskAsyncStorage =
  createAsyncLocalStorage()
