import type { ReactNode } from 'react'
import { FetchesClientData } from './client'
import { DataCacheProvider } from '../../../../client-data-fetching-lib/server'

// Make sure that the holes from this layout aren't factored in for validation
// (otherwise, we'd check a navigation into it from the root layout and fail)
export const unstable_instant = false

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DataCacheProvider>
      <div>
        <p>
          This layout renders a client component that suspends in SSR, but it
          doesn't not block the children, so we can still validate them.
        </p>
        <FetchesClientData />
      </div>
      <hr />
      {children}
    </DataCacheProvider>
  )
}
