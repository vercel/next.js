import type { AsyncLocalStorage } from 'async_hooks'
import { PreviewData } from '../../../types'
import type {
  ReadonlyHeaders,
  ReadonlyRequestCookies,
} from '../../server/app-render'

export interface RequestStore {
  readonly headers: ReadonlyHeaders
  readonly cookies: ReadonlyRequestCookies
  readonly previewData: PreviewData
}

export type RequestAsyncStorage = AsyncLocalStorage<RequestStore>

// AsyncLocalStorage is polyfilled in runtimes without AsyncLocalStorage.
export const requestAsyncStorage: RequestAsyncStorage = new (
  globalThis as any
).AsyncLocalStorage()
