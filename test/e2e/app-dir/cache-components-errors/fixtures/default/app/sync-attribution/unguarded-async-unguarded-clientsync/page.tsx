import { cookies } from 'next/headers'

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
          In this version neither component is wrapped in a Suspense boundary.
          There are no defined semantics about which reason is more "valid" than
          another but with the current implementation we report the `new Date()`
          reason when failing the build.
        </p>
      </section>
      <section>
        <SyncIO />
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
