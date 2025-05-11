import { createAsyncLocalStorage } from './async-local-storage'
import type { DynamicAccessStorage } from './dynamic-access-async-storage.external'

export const dynamicAccessAsyncStorageInstance: DynamicAccessStorage =
  createAsyncLocalStorage()
