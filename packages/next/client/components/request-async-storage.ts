import type { AsyncLocalStorage } from 'async_hooks'
import { Cookies } from '../../server/web/spec-extension/cookies'

export interface RequestStore {
  headers: Headers
  cookies: Cookies
  previewData: any
}

export let requestAsyncStorage: AsyncLocalStorage<RequestStore> | RequestStore =
  {} as any

if (process.env.NEXT_RUNTIME !== 'edge' && typeof window === 'undefined') {
  requestAsyncStorage = new (require('async_hooks').AsyncLocalStorage)()
}
