import { connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page({ params }) {
  return (
    <>
      <p>
        This page accesses params synchronously. This does not trigger dynamic,
        and the build should succeed. In dev mode, we do log an error for the
        sync access though.
      </p>
      <ParamsReadingComponent params={params} />
      <Suspense>
        <Dynamic />
      </Suspense>
    </>
  )
}

async function ParamsReadingComponent({ params }) {
  return (
    <div>
      this component read the `slug` param synchronously:{' '}
      <span id="param">{String(params.slug)}</span>
    </div>
  )
}

// This component ensures that we're creating a partially prerendered page, so
// that we also test that there are no sync params defined during the
// resume.
async function Dynamic() {
  await connection()

  return null
}
