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
          This layout errors in SSR, and the errors is caught by a Suspense
          boundary, but it blocks the children slot so it prevents validation.
        </p>
        <Suspense>
          <ErrorInSSR>{children}</ErrorInSSR>
        </Suspense>
      </div>
    </>
  )
}
