import { useContext } from 'react'
import {
  HeadersContext,
  PreviewDataContext,
  CookiesContext,
} from './hooks-server-context'

export function useHeaders() {
  return useContext(HeadersContext)
}

export function usePreviewData() {
  return useContext(PreviewDataContext)
}

export function useCookies() {
  return useContext(CookiesContext)
}
