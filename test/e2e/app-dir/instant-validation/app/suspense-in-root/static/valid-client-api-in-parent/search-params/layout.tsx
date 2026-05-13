import type { ReactNode } from 'react'
import { ShouldNotSuspendDuringValidation } from './client'

// Make sure that the holes from this layout aren't factored in for validation
// (otherwise, we'd check a navigation into it from the root layout and fail)
export const unstable_instant = false

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <div>
        <p>
          This layout renders a client component that accesses
          useSearchParams(). This would suspend a prerender, but does not affect
          client navigations, so this should be allowed.
        </p>
      </div>
      <hr />
      <ShouldNotSuspendDuringValidation>
        {children}
      </ShouldNotSuspendDuringValidation>
    </>
  )
}
