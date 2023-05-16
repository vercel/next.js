import {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from '../../server/web/spec-extension/adapters/request-cookies'
import { HeadersAdapter } from '../../server/web/spec-extension/adapters/headers'
import { RequestCookies } from '../../server/web/spec-extension/cookies'
import { requestAsyncStorage } from './request-async-storage'
import { actionAsyncStorage } from './action-async-storage'
import { staticGenerationBailout } from './static-generation-bailout'
import { DraftMode } from './draft-mode'

export function headers() {
  if (staticGenerationBailout('headers')) {
    return HeadersAdapter.seal(new Headers({}))
  }

  const requestStore = requestAsyncStorage.getStore()
  if (!requestStore) {
    throw new Error(
      `Invariant: Method expects to have requestAsyncStorage, none available`
    )
  }

  return requestStore.headers
}

export function cookies() {
  if (staticGenerationBailout('cookies')) {
    return RequestCookiesAdapter.seal(new RequestCookies(new Headers({})))
  }

  const requestStore = requestAsyncStorage.getStore()
  if (!requestStore) {
    throw new Error(
      `Invariant: Method expects to have requestAsyncStorage, none available`
    )
  }

  const asyncActionStore = actionAsyncStorage.getStore()
  if (
    asyncActionStore &&
    (asyncActionStore.isAction || asyncActionStore.isAppRoute)
  ) {
    // We can't conditionally return different types here based on the context.
    // To avoid confusion, we always return the readonly type here.
    return requestStore.mutableCookies as unknown as ReadonlyRequestCookies
  }

  return requestStore.cookies
}

export function draftMode() {
  const requestStore = requestAsyncStorage.getStore()
  if (!requestStore) {
    throw new Error(
      `Invariant: Method expects to have requestAsyncStorage, none available`
    )
  }
  return new DraftMode(requestStore.draftMode)
}
