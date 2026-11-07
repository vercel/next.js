import { cookies } from 'next/headers'

import { SyncIO } from './client'
import { Suspense } from 'react'

export default async function Page() {
  return (
    <main>
      <section>
        <p>
          In this test a client component reads `new Date()` from a microtask
          while a Server Component awaits cookies.
        </p>
        <p>
          The server component is not wrapped in Suspense. We currently cannot
          attribute sync IO from a microtask, so the error should reference
          request data rather than `new Date()`.
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
