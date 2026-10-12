import { getOrCreateGlobalAsyncLocalStorage } from './async-local-storage'
import type { ConsoleAsyncStorage } from './console-async-storage.external'

export const consoleAsyncStorageInstance: ConsoleAsyncStorage =
  getOrCreateGlobalAsyncLocalStorage('console-async-storage')
