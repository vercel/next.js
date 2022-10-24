import type { AsyncLocalStorage } from 'async_hooks'
import type {
  ReadonlyHeaders,
  ReadonlyRequestCookies,
} from '../../server/app-render'

export interface RequestStore {
  headers: ReadonlyHeaders
  cookies: ReadonlyRequestCookies
  previewData: any
}

export let requestAsyncStorage: AsyncLocalStorage<RequestStore> | RequestStore =
  {} as any

if (process.env.NEXT_RUNTIME !== 'edge' && typeof window === 'undefined') {
  requestAsyncStorage = new (require('async_hooks').AsyncLocalStorage)()
}
