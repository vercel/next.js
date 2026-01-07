import type { ActionAsyncStorage } from './action-async-storage.external'
import { createAsyncLocalStorage } from './async-local-storage'

export const actionAsyncStorageInstance: ActionAsyncStorage =
  createAsyncLocalStorage()
