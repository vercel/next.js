import { type ReactNode } from 'react'
import { ErrorInSSR } from './client'
import { connection } from 'next/server'

// Make sure that the holes from this layout aren't factored in for validation
// (otherwise, we'd check a navigation into it from the root layout and fail)
export const unstable_instant = false

export default async function Layout({ children }: { children: ReactNode }) {
  await connection() // Prevent the error from failing the prerender in build
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
