import type { AfterTaskAsyncStorage } from './after-task-async-storage.external'
import { getOrCreateGlobalAsyncLocalStorage } from './async-local-storage'

export const afterTaskAsyncStorageInstance: AfterTaskAsyncStorage =
  getOrCreateGlobalAsyncLocalStorage('after-task-async-storage')
