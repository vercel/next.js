import { createAsyncLocalStorage } from './async-local-storage'
import type { CacheScopeStorageAsyncStorage } from './cache-scope-storage.external'

export const cacheScopeAsyncStorage: CacheScopeStorageAsyncStorage =
  createAsyncLocalStorage()
