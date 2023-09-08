import type { AsyncLocalStorage } from 'async_hooks'
import type { DraftModeProvider } from '../../server/async-storage/draft-mode-provider'
import type { ResponseCookies } from '../../server/web/spec-extension/cookies'
import type { ReadonlyHeaders } from '../../server/web/spec-extension/adapters/headers'
import type { ReadonlyRequestCookies } from '../../server/web/spec-extension/adapters/request-cookies'
import type { NextURL } from '../../server/web/next-url'

import { createAsyncLocalStorage } from './async-local-storage'

export interface RequestStore {
  readonly headers: ReadonlyHeaders
  readonly cookies: ReadonlyRequestCookies
  readonly mutableCookies: ResponseCookies
  readonly url: NextURL
  readonly draftMode: DraftModeProvider
}

export type RequestAsyncStorage = AsyncLocalStorage<RequestStore>

export const requestAsyncStorage: RequestAsyncStorage =
  createAsyncLocalStorage()
