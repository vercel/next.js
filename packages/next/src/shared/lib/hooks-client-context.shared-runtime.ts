'use client'

import { createContext } from 'react'
import type { Params } from '../../server/request/params'

export const SearchParamsContext = createContext<URLSearchParams | null>(null)
export const PathnameContext = createContext<string | null>(null)
export const PathParamsContext = createContext<Params | null>(null)

// Dev-only context for Suspense DevTools instrumentation
// These promises are used to track navigation hook usage in React DevTools
// The promise values are updated with actual hook values before calling use()
// These are instrumented promises with additional properties that React DevTools expects
type InstrumentedPromise<T> = Promise<T> & {
  status: 'fulfilled'
  value: T
  displayName: string
}

export type NavigationPromises = {
  pathname: InstrumentedPromise<string>
  searchParams: InstrumentedPromise<any> // ReadonlyURLSearchParams
  params: InstrumentedPromise<any> // Params
  selectedLayoutSegment: InstrumentedPromise<string | null>
  selectedLayoutSegments: InstrumentedPromise<string[]>
}

export const NavigationPromisesContext =
  createContext<NavigationPromises | null>(null)

if (process.env.NODE_ENV !== 'production') {
  SearchParamsContext.displayName = 'SearchParamsContext'
  PathnameContext.displayName = 'PathnameContext'
  PathParamsContext.displayName = 'PathParamsContext'
  NavigationPromisesContext.displayName = 'NavigationPromisesContext'
}
