import { Suspense, type ReactNode } from 'react'
import { ErrorInSSR } from './client'
import { connection } from 'next/server'

// Make sure that the holes from this layout aren't factored in for validation
// (otherwise, we'd check a navigation into it from the root layout and fail)
export const instant = false

export default async function Layout({ children }: { children: ReactNode }) {
  await connection() // Prevent the error from failing the prerender in build
  return (
    <>
      <div>
        <p>
          This layout errors in SSR, but the error is wrapped in Suspense and
          does not block the children slot, so it does not prevent us from
          validating the page.
        </p>
        <Suspense>
          <ErrorInSSR />
        </Suspense>
        {children}
      </div>
    </>
  )
}
