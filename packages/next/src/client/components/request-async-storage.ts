import type { AsyncLocalStorage } from 'async_hooks'
import type { ResponseCookies } from '../../server/web/spec-extension/cookies'
import type { PreviewData } from '../../../types'
import type { ReadonlyHeaders } from '../../server/web/spec-extension/adapters/headers'
import type { ReadonlyRequestCookies } from '../../server/web/spec-extension/adapters/request-cookies'

import { createAsyncLocalStorage } from './async-local-storage'

export interface RequestStore {
  readonly headers: ReadonlyHeaders
  readonly cookies: ReadonlyRequestCookies
  readonly mutableCookies: ResponseCookies
  readonly previewData: PreviewData
}

export type RequestAsyncStorage = AsyncLocalStorage<RequestStore>

export const requestAsyncStorage: RequestAsyncStorage =
  createAsyncLocalStorage()
