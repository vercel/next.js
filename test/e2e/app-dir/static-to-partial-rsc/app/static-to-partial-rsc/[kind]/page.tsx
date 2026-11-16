import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { cookies } from 'next/headers'
import { navigation, prefetch } from 'next/cache'
import { Suspense } from 'react'

export function generateStaticParams() {
  return ['navigation', 'runtime-prefetch', 'runtime-shell'].map((kind) => ({
    kind,
  }))
}

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
  // Regeneration adds request data to a route with a complete build-time RSC
  // file.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return <p id="build-content">Build-time content</p>
  }

  const caller = (await cookies()).get('caller')?.value ?? 'none'
  return (
    <>
      <p id="caller">{`Caller: ${caller}`}</p>
      <Suspense fallback={<p id="prefetch-fallback">Waiting for prefetch</p>}>
        <PrefetchContent />
      </Suspense>
      <Suspense
        fallback={<p id="navigation-fallback">Waiting for navigation</p>}
      >
        <NavigationContent />
      </Suspense>
    </>
  )
}

async function PrefetchContent() {
  await prefetch()
  return <p id="prefetch-content">Prefetch content</p>
}

async function NavigationContent() {
  await navigation()
  return <p id="navigation-content">Navigation content</p>
}
