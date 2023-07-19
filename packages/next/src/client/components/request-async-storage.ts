import type { AsyncLocalStorage } from 'async_hooks'
import type { IncomingMessage } from 'http'
import type { DraftModeProvider } from '../../server/async-storage/draft-mode-provider'
import type { ResponseCookies } from '../../server/web/spec-extension/cookies'
import type { ReadonlyHeaders } from '../../server/web/spec-extension/adapters/headers'
import type { ReadonlyRequestCookies } from '../../server/web/spec-extension/adapters/request-cookies'

import { createAsyncLocalStorage } from './async-local-storage'
import { NextRequest } from '../../server/web/spec-extension/request'
import { BaseNextRequest } from '../../server/base-http'

export interface RequestStore {
  readonly headers: ReadonlyHeaders
  readonly cookies: ReadonlyRequestCookies
  readonly mutableCookies: ResponseCookies
  readonly draftMode: DraftModeProvider
  readonly DO_NOT_USE_OR_YOU_WILL_BE_FIRED_request:
    | IncomingMessage
    | BaseNextRequest
    | NextRequest
}

export type RequestAsyncStorage = AsyncLocalStorage<RequestStore>

export const requestAsyncStorage: RequestAsyncStorage =
  createAsyncLocalStorage()
