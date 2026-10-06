import type { WorkAsyncStorage } from './work-async-storage.external'
import { getOrCreateGlobalAsyncLocalStorage } from './async-local-storage'

export const workAsyncStorageInstance: WorkAsyncStorage =
  getOrCreateGlobalAsyncLocalStorage('work-async-storage')
