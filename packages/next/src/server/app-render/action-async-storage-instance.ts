import type { ActionAsyncStorage } from './action-async-storage.external'
import { getOrCreateGlobalAsyncLocalStorage } from './async-local-storage'

export const actionAsyncStorageInstance: ActionAsyncStorage =
  getOrCreateGlobalAsyncLocalStorage('action-async-storage')
