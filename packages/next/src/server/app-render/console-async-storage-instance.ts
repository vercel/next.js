import { createAsyncLocalStorage } from './async-local-storage'
import type { ConsoleAsyncStorage } from './console-async-storage.external'

export const consoleAsyncStorageInstance: ConsoleAsyncStorage =
  createAsyncLocalStorage()
