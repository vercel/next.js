import { DynamicServerError } from './hooks-server-context'
import { requestAsyncStorage } from './request-async-storage'
import { staticGenerationAsyncStorage } from './static-generation-async-storage'

function staticGenerationBailout(reason: string) {
  const staticGenerationStore =
    staticGenerationAsyncStorage && 'getStore' in staticGenerationAsyncStorage
      ? staticGenerationAsyncStorage?.getStore()
      : staticGenerationAsyncStorage

  if (staticGenerationStore?.isStaticGeneration) {
    // TODO: honor the dynamic: 'force-static'
    if (staticGenerationStore) {
      staticGenerationStore.revalidate = 0
    }
    throw new DynamicServerError(reason)
  }
}

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
