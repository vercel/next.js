import type { StaticGenerationAsyncStorage } from './work-async-storage.external'
import { createAsyncLocalStorage } from './async-local-storage'

export const workAsyncStorage: StaticGenerationAsyncStorage =
  createAsyncLocalStorage()
