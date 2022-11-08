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

// @ts-expect-error we provide this on global in
// the edge and node runtime
if (global.AsyncLocalStorage) {
  requestAsyncStorage = new (global as any).AsyncLocalStorage()
}
