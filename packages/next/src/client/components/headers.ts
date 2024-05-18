import {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from '../../server/web/spec-extension/adapters/request-cookies'
import { HeadersAdapter } from '../../server/web/spec-extension/adapters/headers'
import { RequestCookies } from '../../server/web/spec-extension/cookies'
import { actionAsyncStorage } from './action-async-storage.external'
import { DraftMode } from './draft-mode'
import { trackDynamicDataAccessed } from '../../server/app-render/dynamic-rendering'
import { staticGenerationAsyncStorage } from './static-generation-async-storage.external'
import { getExpectedRequestStore } from './request-async-storage.external'

/**
 * This function allows you to read the HTTP incoming request headers in
 * [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components),
 * [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations),
 * [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) and
 * [Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware).
 *
 * Read more: [Next.js Docs: `headers`](https://nextjs.org/docs/app/api-reference/functions/headers)
 */
export function headers() {
  const callingExpression = 'headers'
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  if (staticGenerationStore) {
    if (staticGenerationStore.forceStatic) {
      // When we are forcing static we don't mark this as a Dynamic read and we return an empty headers object
      return HeadersAdapter.seal(new Headers({}))
    } else {
      // We will return a real headers object below so we mark this call as reading from a dynamic data source
      trackDynamicDataAccessed(staticGenerationStore, callingExpression)
    }
  }

  return getExpectedRequestStore(callingExpression).headers
}

export function cookies() {
  const callingExpression = 'cookies'
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  if (staticGenerationStore) {
    if (staticGenerationStore.forceStatic) {
      // When we are forcing static we don't mark this as a Dynamic read and we return an empty cookies object
      return RequestCookiesAdapter.seal(new RequestCookies(new Headers({})))
    } else {
      // We will return a real headers object below so we mark this call as reading from a dynamic data source
      trackDynamicDataAccessed(staticGenerationStore, callingExpression)
    }
  }

  const requestStore = getExpectedRequestStore(callingExpression)

  const asyncActionStore = actionAsyncStorage.getStore()
  if (asyncActionStore?.isAction || asyncActionStore?.isAppRoute) {
    // We can't conditionally return different types here based on the context.
    // To avoid confusion, we always return the readonly type here.
    return requestStore.mutableCookies as unknown as ReadonlyRequestCookies
  }

  return requestStore.cookies
}

export function draftMode() {
  const callingExpression = 'draftMode'
  const requestStore = getExpectedRequestStore(callingExpression)

  return new DraftMode(requestStore.draftMode)
}
