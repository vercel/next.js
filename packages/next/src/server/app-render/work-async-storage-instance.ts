import type { WorkAsyncStorage } from './work-async-storage.external'
import { createAsyncLocalStorage } from './async-local-storage'

export const workAsyncStorage: WorkAsyncStorage = createAsyncLocalStorage()
