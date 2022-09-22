import { useContext } from 'react'
import {
  HeadersContext,
  PreviewDataContext,
  CookiesContext,
  DynamicServerError,
} from './hooks-server-context'
import { staticGenerationAsyncStorage } from './static-generation-async-storage'

function useStaticGenerationBailout(reason: string) {
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

export function useHeaders() {
  useStaticGenerationBailout('useHeaders')
  return useContext(HeadersContext)
}

export function usePreviewData() {
  useStaticGenerationBailout('usePreviewData')
  return useContext(PreviewDataContext)
}

export function useCookies() {
  useStaticGenerationBailout('useCookies')
  return useContext(CookiesContext)
}
