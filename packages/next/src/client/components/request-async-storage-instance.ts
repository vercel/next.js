import { createAsyncLocalStorage } from './async-local-storage'
import type { RequestAsyncStorage } from './request-async-storage.external'

export const requestAsyncStorage: RequestAsyncStorage =
  createAsyncLocalStorage()
