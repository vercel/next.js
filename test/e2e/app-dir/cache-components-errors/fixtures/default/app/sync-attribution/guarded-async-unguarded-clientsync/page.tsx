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
          In this version the client component is not wrapped in a Suspense
          boundary. We expect this to be a build failure with the reason
          pointing to the line where `new Date()` was called.
        </p>
      </section>
      <section>
        <SyncIO />
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
