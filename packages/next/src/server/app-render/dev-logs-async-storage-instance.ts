import { createAsyncLocalStorage } from './async-local-storage'
import type { DevLogsAsyncStorage } from './dev-logs-async-storage.external'

export const devLogsAsyncStorageInstance: DevLogsAsyncStorage =
  createAsyncLocalStorage()
