import { useContext } from 'react'
import {
  HeadersContext,
  PreviewDataContext,
  CookiesContext,
  DynamicServerError,
  StaticGenerationContext,
} from './hooks-server-context'

function useStaticGenerationBailout() {
  if (useContext(StaticGenerationContext)) {
    throw new DynamicServerError('useHeader')
  }
}

export function useHeaders() {
  useStaticGenerationBailout()
  return useContext(HeadersContext)
}

export function usePreviewData() {
  useStaticGenerationBailout()
  return useContext(PreviewDataContext)
}

export function useCookies() {
  useStaticGenerationBailout()
  return useContext(CookiesContext)
}
