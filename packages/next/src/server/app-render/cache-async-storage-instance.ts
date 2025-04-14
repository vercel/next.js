import { createAsyncLocalStorage } from './async-local-storage'
import type { CacheAsyncStorage } from './cache-async-storage.external'

export const cacheAsyncStorageInstance: CacheAsyncStorage =
  createAsyncLocalStorage()
