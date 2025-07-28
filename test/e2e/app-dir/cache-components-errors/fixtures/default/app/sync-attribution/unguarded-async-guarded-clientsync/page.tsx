import { cookies } from 'next/headers'

import { SyncIO } from './client'
import { Suspense } from 'react'

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
          In this version the server component is not wrapped in a Suspense
          boundary. We expect the build to error with the reason referencing
          some dynamic data access. It should not mention `new Date()`.
        </p>
      </section>
      <section>
        <Suspense fallback={<p>Loading...</p>}>
          <SyncIO />
        </Suspense>
      </section>
      <section>
        <RequestData />
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
