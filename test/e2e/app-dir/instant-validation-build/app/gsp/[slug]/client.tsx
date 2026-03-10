'use client'

import { useParams, usePathname } from 'next/navigation'
import { ClientAssertionError } from '../../../client-assertion-error'

/**
 * Asserts that client hooks receive sample params during instant validation,
 * not the values from generateStaticParams. This component is inside a Suspense
 * boundary gated by `await cookies()`, so it only renders during validation.
 */
export function AssertParamsClient() {
  const params = useParams()
  const pathname = usePathname()

  // During validation, useParams() should return the sample param ('hello'),
  // not a value from generateStaticParams ('foo' or 'bar').
  if (params.slug !== 'hello') {
    throw new ClientAssertionError(
      `Expected useParams().slug === 'hello' (from sample), got '${params.slug}'`
    )
  }

  // usePathname() should reflect the sample param value too.
  if (pathname !== '/gsp/hello') {
    throw new ClientAssertionError(
      `Expected usePathname() === '/gsp/hello', got '${pathname}'`
    )
  }

  return null
}
