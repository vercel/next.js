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

export function useHeaders(): Headers {
  staticGenerationBailout('useHeaders')
  const requestStore =
    requestAsyncStorage && 'getStore' in requestAsyncStorage
      ? requestAsyncStorage.getStore()!
      : requestAsyncStorage

  return requestStore.headers
}

export function usePreviewData() {
  staticGenerationBailout('usePreviewData')
  const requestStore =
    requestAsyncStorage && 'getStore' in requestAsyncStorage
      ? requestAsyncStorage.getStore()!
      : requestAsyncStorage
  return requestStore.previewData
}

export function useCookies() {
  staticGenerationBailout('useCookies')
  const requestStore =
    requestAsyncStorage && 'getStore' in requestAsyncStorage
      ? requestAsyncStorage.getStore()!
      : requestAsyncStorage

  return requestStore.cookies
}
