'use client'

import { createContext } from 'react'

export const SearchParamsContext = createContext<URLSearchParams | null>(null)
export const PathnameContext = createContext<string | null>(null)
export const ParamsContext = createContext(null as any)
export const LayoutSegmentsContext = createContext(null as any)

if (process.env.NODE_ENV !== 'production') {
  SearchParamsContext.displayName = 'SearchParamsContext'
  PathnameContext.displayName = 'PathnameContext'
  ParamsContext.displayName = 'ParamsContext'
  LayoutSegmentsContext.displayName = 'LayoutSegmentsContext'
}
