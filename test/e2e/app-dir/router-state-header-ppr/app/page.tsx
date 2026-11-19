import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default function Page() {
  return (
    <main>
      <p>Static shell</p>
      <Suspense fallback={<p>Loading request data</p>}>
        <Content />
      </Suspense>
    </main>
  )
}

async function Content() {
  // The build emits a fully static route with a complete RSC payload.
  // Regeneration adds request data, so the route becomes partially
  // prerendered and RSC navigations render the dynamic content with the
  // client's router state.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return <p id="build-content">Build-time content</p>
  }

  const caller = (await cookies()).get('caller')?.value ?? 'none'
  return <p id="caller">{`Caller: ${caller}`}</p>
}
