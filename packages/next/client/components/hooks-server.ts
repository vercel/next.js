import { useContext } from 'react'
import {
  HeadersContext,
  PreviewDataContext,
  CookiesContext,
  DynamicServerError,
} from './hooks-server-context'

export function useHeaders() {
  if (process.env.PHASE === 'phase-production-build') {
    throw new DynamicServerError('useHeader')
  }
  return useContext(HeadersContext)
}

export function usePreviewData() {
  if (process.env.PHASE === 'phase-production-build') {
    throw new DynamicServerError('usePreviewData')
  }
  return useContext(PreviewDataContext)
}

export function useCookies() {
  if (process.env.PHASE === 'phase-production-build') {
    throw new DynamicServerError('useCookies')
  }
  return useContext(CookiesContext)
}
