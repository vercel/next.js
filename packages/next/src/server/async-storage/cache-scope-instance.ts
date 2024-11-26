import type { CacheScopeStore } from './cache-scope.external'

import { createAsyncLocalStorage } from '../app-render/async-local-storage'

export const cacheScopeAsyncLocalStorage =
  createAsyncLocalStorage<CacheScopeStore>()
