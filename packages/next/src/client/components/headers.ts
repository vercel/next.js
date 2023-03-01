import { RequestCookies } from '../../server/web/spec-extension/cookies'
import { requestAsyncStorage } from './request-async-storage'
import { staticGenerationBailout } from './static-generation-bailout'

export function headers() {
  if (staticGenerationBailout('headers')) {
    return new Headers({})
  }

  const requestStore = requestAsyncStorage.getStore()
  if (!requestStore) {
    throw new Error(
      `Invariant: Method expects to have requestAsyncStorage, none available`
    )
  }

  return requestStore.headers
}

export function previewData() {
  const requestStore = requestAsyncStorage.getStore()
  if (!requestStore) {
    throw new Error(
      `Invariant: Method expects to have requestAsyncStorage, none available`
    )
  }

  return requestStore.previewData
}

export function cookies() {
  if (staticGenerationBailout('cookies')) {
    return new RequestCookies(new Headers({}))
  }

  const requestStore = requestAsyncStorage.getStore()
  if (!requestStore) {
    throw new Error(
      `Invariant: Method expects to have requestAsyncStorage, none available`
    )
  }

  return requestStore.cookies
}
