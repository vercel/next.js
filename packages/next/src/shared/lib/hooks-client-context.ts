'use client'

import { createContext } from 'react'

export const SearchParamsContext = createContext<URLSearchParams | null>(null)
export const PathnameContext = createContext<string | null>(null)

if (process.env.NODE_ENV !== 'production') {
  SearchParamsContext.displayName = 'SearchParamsContext'
  PathnameContext.displayName = 'PathnameContext'
}
