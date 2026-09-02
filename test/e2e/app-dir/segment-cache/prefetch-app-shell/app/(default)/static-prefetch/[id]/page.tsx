import { Suspense } from 'react'
import { unstable_prefetch } from 'next/cache'
import { connection } from 'next/server'

export async function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }]
}

type Params = { id: string }

export const prefetch = 'partial'

export default async function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <Suspense fallback={<p id="shell">App shell for prefetch</p>}>
        <ParamsDependent params={params} />
      </Suspense>
      <Suspense fallback={<p id="prefetch-loading">Loading prefetch...</p>}>
        <PrefetchData />
      </Suspense>
    </main>
  )
}

async function PrefetchData() {
  await unstable_prefetch() // Exclude the contents below from the shell
  return <div id="prefetch-content">Prefetch content</div>
}

async function ParamsDependent({ params }: { params: Promise<Params> }) {
  // Make sure the static prefetch varies on params so that the client router
  // has to extract a static shell from it when navigating to another param value.
  // If the static prefetch doesn't vary on params, it'll be used instead of
  // the app shell
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
