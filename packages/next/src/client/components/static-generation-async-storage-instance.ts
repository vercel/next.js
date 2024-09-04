import type { StaticGenerationAsyncStorage } from './static-generation-async-storage.external'
import { createAsyncLocalStorage } from './async-local-storage'

export const staticGenerationAsyncStorage: StaticGenerationAsyncStorage =
  createAsyncLocalStorage()
