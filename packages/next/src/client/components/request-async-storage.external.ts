import type { AsyncLocalStorage } from 'async_hooks'
import type { DraftModeProvider } from '../../server/async-storage/draft-mode-provider'
import type { ResponseCookies } from '../../server/web/spec-extension/cookies'
import type { ReadonlyHeaders } from '../../server/web/spec-extension/adapters/headers'
import type { ReadonlyRequestCookies } from '../../server/web/spec-extension/adapters/request-cookies'

// Share the instance module in the next-shared layer
import { requestAsyncStorage } from './request-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import type { AfterContext } from '../../server/after/after-context'
import type { ServerComponentsHmrCache } from '../../server/response-cache'

export interface RequestStore {
  /**
   * The URL of the request. This only specifies the pathname and the search
   * part of the URL.
   */
  readonly url: {
    /**
     * The pathname of the requested URL.
     */
    readonly pathname: string

    /**
     * The search part of the requested URL. If the request did not provide a
     * search part, this will be an empty string.
     */
    readonly search: string
  }

  readonly headers: ReadonlyHeaders
  readonly cookies: ReadonlyRequestCookies
  readonly mutableCookies: ResponseCookies
  readonly draftMode: DraftModeProvider
  readonly reactLoadableManifest: DeepReadonly<
    Record<string, { files: string[] }>
  >
  readonly assetPrefix: string
  readonly afterContext: AfterContext | undefined
  readonly isHmrRefresh?: boolean
  readonly serverComponentsHmrCache?: ServerComponentsHmrCache
}

export type RequestAsyncStorage = AsyncLocalStorage<RequestStore>

export { requestAsyncStorage }

export function getExpectedRequestStore(callingExpression: string) {
  const store = requestAsyncStorage.getStore()
  if (store) return store
  throw new Error(
    `\`${callingExpression}\` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`
  )
}
