import type { AsyncLocalStorage } from 'async_hooks'
import type { PreviewData } from '../../../types'
import type { MutableRequestCookies } from '../../server/app-render/mutable-request-cookies'
import type { ReadonlyHeaders } from '../../server/app-render/readonly-headers'
import type { ReadonlyRequestCookies } from '../../server/app-render/readonly-request-cookies'

import { createAsyncLocalStorage } from './async-local-storage'

export interface RequestStore {
  readonly headers: ReadonlyHeaders
  readonly cookies: ReadonlyRequestCookies
  readonly mutableCookies: MutableRequestCookies
  readonly previewData: PreviewData
}

export type RequestAsyncStorage = AsyncLocalStorage<RequestStore>

export const requestAsyncStorage: RequestAsyncStorage =
  createAsyncLocalStorage()
