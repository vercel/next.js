'use client'

import { createContext } from 'react'
import type { Params } from '../../server/request/params'

export const SearchParamsContext = createContext<URLSearchParams | null>(null)
export const PathnameContext = createContext<string | null>(null)
export const PathParamsContext = createContext<Params | null>(null)

// Dev-only context for Suspense DevTools instrumentation
// These promises are used to track navigation hook usage in React DevTools
export type InstrumentedPromise<T> = Promise<T> & {
  status: 'fulfilled'
  value: T
  displayName: string
}

export type NavigationPromises = {
  pathname: InstrumentedPromise<string>
  searchParams: InstrumentedPromise<any> // ReadonlyURLSearchParams
  params: InstrumentedPromise<any> // Params
  // Layout segment hooks (updated at each layout boundary)
  selectedLayoutSegmentPromises?: Map<
    string,
    InstrumentedPromise<string | null>
  >
  selectedLayoutSegmentsPromises?: Map<string, InstrumentedPromise<string[]>>
}

export const NavigationPromisesContext =
  createContext<NavigationPromises | null>(null)

// Creates an instrumented promise for Suspense DevTools
// These promises are always fulfilled and exist purely for
// tracking in React's Suspense DevTools.
export function createDevToolsInstrumentedPromise<T>(
  displayName: string,
  value: T
): InstrumentedPromise<T> {
  const promise = Promise.resolve(value) as InstrumentedPromise<T>
  promise.status = 'fulfilled'
  promise.value = value
  promise.displayName = `${displayName} (SSR)`
  return promise
}

if (process.env.NODE_ENV !== 'production') {
  SearchParamsContext.displayName = 'SearchParamsContext'
  PathnameContext.displayName = 'PathnameContext'
  PathParamsContext.displayName = 'PathParamsContext'
  NavigationPromisesContext.displayName = 'NavigationPromisesContext'
}
