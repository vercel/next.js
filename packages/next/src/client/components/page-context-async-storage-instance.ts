import type { PageContextAsyncStorage } from './page-context-async-storage.external'
import { createAsyncLocalStorage } from './async-local-storage'

export const pageContextAsyncStorage: PageContextAsyncStorage =
  createAsyncLocalStorage()
