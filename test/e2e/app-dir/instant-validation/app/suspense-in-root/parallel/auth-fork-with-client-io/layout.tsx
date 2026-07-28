import { ReactNode, Suspense } from 'react'
import { cookies } from 'next/headers'
import { FetchesClientData } from './client'
import { DataCacheProvider } from '../../../../client-data-fetching-lib/server'

// Same request-state fork as auth-fork — when the `logged-in` cookie is
// present only `children` renders, otherwise only `@login` — plus a
// Suspense-isolated client component that suspends on client IO during
// every SSR pass. The isolated client IO is allowed by validation and
// must not affect which fork slot configs are considered: the fork is
// decided by this server layout, so its outcome is knowable from the
// serialized payload alone regardless of any pending client IO.
export default async function AuthForkWithClientIOLayout({
  children,
  login,
}: {
  children: ReactNode
  login: ReactNode
}) {
  const cookieStore = await cookies()
  let branchName: string
  let branch: ReactNode
  if (cookieStore.has('logged-in')) {
    branchName = 'children'
    branch = children
  } else {
    branchName = 'login'
    branch = login
  }
  return (
    <section data-branch={branchName}>
      <DataCacheProvider>
        <Suspense fallback={<p>loading client data...</p>}>
          <FetchesClientData />
        </Suspense>
      </DataCacheProvider>
      {branch}
    </section>
  )
}
