import type { ReactNode } from 'react'
import { SyncIOInClient } from './client'

// Make sure that the holes from this layout aren't factored in for validation
// (otherwise, we'd check a navigation into it from the root layout and fail)
export const unstable_instant = false

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <div>
        <p>
          This layout renders a client component that uses sync IO. We're
          simulating a browser navigation, so sync IO in client components is
          fine and should not prevent us from validating.
        </p>
        <SyncIOInClient>{children}</SyncIOInClient>
      </div>
    </>
  )
}
