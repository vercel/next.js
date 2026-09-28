import { Suspense } from 'react'
import { unstable_prefetch } from 'next/cache'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

type Params = { id: string }

export const prefetch = 'partial'

export default async function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <Suspense fallback={<p id="prefetch-loading">Loading prefetch...</p>}>
        <PrefetchData />
      </Suspense>
      {/* The fallback is the App Shell — the part of the page that
          doesn't depend on params. */}
      <Suspense fallback={<p id="shell">App shell for prefetch</p>}>
        <ParamsDependent params={params} />
      </Suspense>
    </main>
  )
}

async function PrefetchData() {
  await cookies() // Makes sure this page uses a runtime prefetch
  await unstable_prefetch() // Exclude the contents below from runtime app shells
  return <div id="prefetch-content">Prefetch content</div>
}

async function ParamsDependent({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return (
    <>
      <p id="param-value">{`Post ${id}`}</p>
      <Suspense
        fallback={<p id="dynamic-loading">Loading dynamic content...</p>}
      >
        <Dynamic id={id} />
      </Suspense>
    </>
  )
}

async function Dynamic({ id }: { id: string }) {
  await connection()
  return <p id="dynamic-content">{`Post body for ${id}`}</p>
}
