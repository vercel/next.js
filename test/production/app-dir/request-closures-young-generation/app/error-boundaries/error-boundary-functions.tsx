'use client'

import type { ComponentClass, ReactElement } from 'react'
import { catchError } from 'next/error'
import { ErrorBoundaryHandler } from 'next/dist/client/components/error-boundary'
import type * as YoungGeneration from '../../lib/in-young-generation'

const CatchErrorBoundary = catchError(() => null) as (
  props: object
) => ReactElement<object, ComponentClass<object>>

type Boundary = { reset: () => void; retry: () => void }

/**
 * While it is rendered on the server, creates the error boundary of an
 * `error.js` file and the one of `catchError()`, and reports where V8 keeps
 * the `reset` and `retry` functions of each.
 */
export function ErrorBoundaryFunctions() {
  let report = ''
  if (typeof window === 'undefined') {
    const { createControl, inYoungGeneration } = (
      globalThis as unknown as { youngGeneration: typeof YoungGeneration }
    ).youngGeneration

    const errorBoundary: Boundary = new ErrorBoundaryHandler({
      pathname: null,
      errorComponent: () => null,
    })
    // `catchError()` does not export its boundary. The component that it
    // returns renders it.
    const catchErrorElement = CatchErrorBoundary({})
    const catchErrorBoundary = new catchErrorElement.type(
      catchErrorElement.props
    ) as unknown as Boundary

    report = [
      `control:${inYoungGeneration(createControl())}`,
      `errorBoundary.reset:${inYoungGeneration(errorBoundary.reset)}`,
      `errorBoundary.retry:${inYoungGeneration(errorBoundary.retry)}`,
      `catchError.reset:${inYoungGeneration(catchErrorBoundary.reset)}`,
      `catchError.retry:${inYoungGeneration(catchErrorBoundary.retry)}`,
    ].join(' ')
  }
  // The browser has nothing to report and keeps the text from the server.
  return <p suppressHydrationWarning>{report}</p>
}
