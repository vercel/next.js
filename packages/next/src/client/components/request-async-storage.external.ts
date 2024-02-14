import type { AsyncLocalStorage } from 'async_hooks'
import type { DraftModeProvider } from '../../server/async-storage/draft-mode-provider'
import type { ResponseCookies } from '../../server/web/spec-extension/cookies'
import type { ReadonlyHeaders } from '../../server/web/spec-extension/adapters/headers'
import type { ReadonlyRequestCookies } from '../../server/web/spec-extension/adapters/request-cookies'

import { createAsyncLocalStorage } from './async-local-storage'

export interface RequestStore {
  readonly headers: ReadonlyHeaders
  readonly cookies: ReadonlyRequestCookies
  readonly mutableCookies: ResponseCookies
  readonly draftMode: DraftModeProvider
}

export type RequestAsyncStorage = AsyncLocalStorage<RequestStore>

export const requestAsyncStorage: RequestAsyncStorage =
  createAsyncLocalStorage()

export function getExpectedRequestStore(callingExpression: string) {
  const store = requestAsyncStorage.getStore()
  if (!store) {
    throw new Error(
      `Invariant: \`${callingExpression}\` expects to have requestAsyncStorage, none available.`
    )
  }
  return store
}
