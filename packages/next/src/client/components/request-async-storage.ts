import { PreviewData } from '../../../types'
import type {
  ReadonlyHeaders,
  ReadonlyRequestCookies,
} from '../../server/app-render'
import { AsyncLocalStorageAdapter } from '../../server/async-local-storage-adapter'

export interface RequestStore {
  readonly headers: ReadonlyHeaders
  readonly cookies: ReadonlyRequestCookies
  readonly previewData: PreviewData
}

export type RequestAsyncStorage = AsyncLocalStorageAdapter<RequestStore>

export const requestAsyncStorage: RequestAsyncStorage =
  new AsyncLocalStorageAdapter()
