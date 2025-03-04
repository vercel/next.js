'use client'

import { createContext } from 'react'
import type { Params } from '../../server/request/params'

export const SearchParamsContext = createContext<URLSearchParams | null>(null)
export const PathnameContext = createContext<string | null>(null)
export const PathParamsContext = createContext<Params | null>(null)
export const OptimisticPathnameContext = createContext<string | null>(null)
export const OptimisticSearchParamsContext =
  createContext<URLSearchParams | null>(null)

if (process.env.NODE_ENV !== 'production') {
  SearchParamsContext.displayName = 'SearchParamsContext'
  PathnameContext.displayName = 'PathnameContext'
  PathParamsContext.displayName = 'PathParamsContext'
  OptimisticPathnameContext.displayName = 'OptimisticPathnameContext'
  OptimisticSearchParamsContext.displayName = 'OptimisticSearchParamsContext'
}
