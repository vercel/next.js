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
          This layout renders a client component that suspends in SSR and blocks
          the children. This prevents us from validating the page below.
        </p>
        <FetchesClientData>{children}</FetchesClientData>
      </div>
    </DataCacheProvider>
  )
}
