'use client'

import { createContext } from 'react'
import type { Params } from '../../server/request/params'
import type { ReadonlyURLSearchParams } from '../../api/navigation'

export const SearchParamsContext =
  createContext<ReadonlyURLSearchParams | null>(null)
export const PathnameContext = createContext<string | null>(null)
export const PathParamsContext = createContext<Params | null>(null)

if (process.env.NODE_ENV !== 'production') {
  SearchParamsContext.displayName = 'SearchParamsContext'
  PathnameContext.displayName = 'PathnameContext'
  PathParamsContext.displayName = 'PathParamsContext'
}
