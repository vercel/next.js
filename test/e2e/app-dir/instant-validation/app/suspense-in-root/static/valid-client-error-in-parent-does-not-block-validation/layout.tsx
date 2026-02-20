import { Suspense, type ReactNode } from 'react'
import { ErrorInSSR } from './client'

// Make sure that the holes from this layout aren't factored in for validation
// (otherwise, we'd check a navigation into it from the root layout and fail)
export const unstable_instant = false

export default function Layout({ children }: { children: ReactNode }) {
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
