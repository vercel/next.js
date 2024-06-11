import { createAsyncLocalStorage } from './async-local-storage'
import type { LifecycleAsyncStorage } from './lifecycle-async-storage.external'

export const _lifecycleAsyncStorage: LifecycleAsyncStorage =
  createAsyncLocalStorage()
