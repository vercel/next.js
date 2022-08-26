import { useContext } from 'react'
import {
  HeadersContext,
  PreviewDataContext,
  CookiesContext,
  DynamicServerError,
  StaticGenerationContext,
} from './hooks-server-context'

function useStaticGenerationBailout(reason: string) {
  if (useContext(StaticGenerationContext)) {
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
