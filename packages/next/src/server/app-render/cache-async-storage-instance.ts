import type { CacheAsyncStorage } from './cache-async-storage.external'
import { createAsyncLocalStorage } from '../../client/components/async-local-storage'

export const cacheAsyncStorage: CacheAsyncStorage = createAsyncLocalStorage()
