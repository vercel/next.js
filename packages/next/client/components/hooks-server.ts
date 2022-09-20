import type { AsyncLocalStorage } from 'async_hooks'
import { useContext } from 'react'
import {
  HeadersContext,
  PreviewDataContext,
  CookiesContext,
  DynamicServerError,
  StaticGenerationContext,
} from './hooks-server-context'

interface StaticGenerationStore {
  pathname?: string
  revalidate?: number
  fetchRevalidate?: number
  isStaticGeneration?: boolean
}

export let staticGenerationAsyncStorage:
  | AsyncLocalStorage<StaticGenerationStore>
  | StaticGenerationStore = {}

if (process.env.NEXT_RUNTIME !== 'edge' && typeof window === 'undefined') {
  staticGenerationAsyncStorage =
    new (require('async_hooks').AsyncLocalStorage)()
}

export function useTrackStaticGeneration() {
  return useContext<
    typeof import('./hooks-server-context').StaticGenerationContext
  >(StaticGenerationContext)
}

function useStaticGenerationBailout(reason: string) {
  const staticGenerationContext = useTrackStaticGeneration()

  if (staticGenerationContext.isStaticGeneration) {
    const staticGenerationStore =
      'getStore' in staticGenerationAsyncStorage
        ? staticGenerationAsyncStorage?.getStore()
        : staticGenerationAsyncStorage

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
