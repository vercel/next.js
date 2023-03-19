import type { AsyncLocalStorage } from 'async_hooks'
import { PreviewData } from '../../../types'
import type { ReadonlyHeaders } from '../../server/app-render/readonly-headers'
import type { ReadonlyRequestCookies } from '../../server/app-render/readonly-request-cookies'
import { createAsyncLocalStorage } from './async-local-storage'

export interface RequestStore {
  readonly headers: ReadonlyHeaders
  readonly cookies: ReadonlyRequestCookies
  readonly previewData: PreviewData
}

export type RequestAsyncStorage = AsyncLocalStorage<RequestStore>

export const requestAsyncStorage: RequestAsyncStorage =
  createAsyncLocalStorage()
