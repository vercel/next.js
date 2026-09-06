import { getOrCreateGlobalAsyncLocalStorage } from './async-local-storage'
import type { DynamicAccessStorage } from './dynamic-access-async-storage.external'

export const dynamicAccessAsyncStorageInstance: DynamicAccessStorage =
  getOrCreateGlobalAsyncLocalStorage('dynamic-access-async-storage')
