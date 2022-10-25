import { requestAsyncStorage } from './request-async-storage'
import { staticGenerationBailout } from './static-generation-bailout'

export function headers() {
  staticGenerationBailout('headers')
  const requestStore =
    requestAsyncStorage && 'getStore' in requestAsyncStorage
      ? requestAsyncStorage.getStore()!
      : requestAsyncStorage

  return requestStore.headers
}

export function previewData() {
  staticGenerationBailout('previewData')
  const requestStore =
    requestAsyncStorage && 'getStore' in requestAsyncStorage
      ? requestAsyncStorage.getStore()!
      : requestAsyncStorage
  return requestStore.previewData
}

export function cookies() {
  staticGenerationBailout('cookies')
  const requestStore =
    requestAsyncStorage && 'getStore' in requestAsyncStorage
      ? requestAsyncStorage.getStore()!
      : requestAsyncStorage

  return requestStore.cookies
}
