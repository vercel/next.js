import { useContext } from 'react'
import {
  HeadersContext,
  PreviewDataContext,
  CookiesContext,
  DynamicServerError,
  StaticGenerationContext,
} from './hooks-server-context'

export function useTrackStaticGeneration() {
  return useContext<
    typeof import('./hooks-server-context').StaticGenerationContext
  >(StaticGenerationContext)
}

function useStaticGenerationBailout(reason: string) {
  const staticGenerationContext = useTrackStaticGeneration()

  if (staticGenerationContext.isStaticGeneration) {
    // TODO: honor the dynamic: 'force-static'
    staticGenerationContext.revalidate = 0
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
