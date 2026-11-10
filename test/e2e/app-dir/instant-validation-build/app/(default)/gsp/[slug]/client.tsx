'use client'

import { useParams, usePathname } from 'next/navigation'
import { assert } from '../../../../client-assertion-error'

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
  assert(
    params.slug === 'hello',
    `Expected useParams().slug === 'hello' (from sample), got '${params.slug}'`
  )

  // usePathname() should reflect the sample param value too.
  assert(
    pathname === '/gsp/hello',
    `Expected usePathname() === '/gsp/hello', got '${pathname}'`
  )

  return null
}
