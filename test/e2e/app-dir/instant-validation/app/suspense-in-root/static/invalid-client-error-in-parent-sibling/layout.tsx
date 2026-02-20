import { type ReactNode } from 'react'
import { ErrorInSSR } from './client'

// Make sure that the holes from this layout aren't factored in for validation
// (otherwise, we'd check a navigation into it from the root layout and fail)
export const unstable_instant = false

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <div>
        <p>
          This layout errors in SSR and the error isn't caught by a Suspense
          boundary, so it blocks the children slot and prevents validation.
        </p>
      </div>
      <hr />
      <ErrorInSSR />
      {children}
    </>
  )
}
