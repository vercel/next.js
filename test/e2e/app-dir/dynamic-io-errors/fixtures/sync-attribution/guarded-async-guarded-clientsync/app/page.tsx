import { cookies } from 'next/headers'
import { Suspense } from 'react'

import { SyncIO } from './client'

export default async function Page() {
  return (
    <main>
      <section>
        <p>
          In this test we have two components. One reads `new Date()`
          synchronously in a client component render. The other awaits cookies
          in a Server Component.
        </p>
        <p>
          In this version both components are wrapped in Suspense. We expect
          that this page will prerender with fallbacks around both components
        </p>
      </section>
      <section>
        <Suspense fallback="">
          <SyncIO />
        </Suspense>
      </section>
      <section>
        <Suspense fallback="">
          <RequestData />
        </Suspense>
      </section>
    </main>
  )
}

async function RequestData() {
  ;(await cookies()).get('foo')
  return (
    <div>
      <h2>Request Data Access</h2>
      <p>This component accesses request data without a Suspense boundary.</p>
    </div>
  )
}
