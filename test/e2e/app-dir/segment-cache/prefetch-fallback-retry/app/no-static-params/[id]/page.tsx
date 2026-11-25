import { Suspense } from 'react'

type Params = { id: string }

// No generateStaticParams: this route's fallback shell can never be upgraded to
// a concrete version, so a prefetch that receives the shell must NOT be flagged
// as a fallback (no client retry).
export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <Suspense
        fallback={<p id="no-gsp-shell">App shell for no-static-params</p>}
      >
        <ParamsDependent params={params} />
      </Suspense>
    </main>
  )
}

async function ParamsDependent({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return <p id="no-gsp-content">{`No-GSP post body for ${id}`}</p>
}
