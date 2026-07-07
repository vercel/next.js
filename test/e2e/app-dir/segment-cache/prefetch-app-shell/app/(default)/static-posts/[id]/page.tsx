import { Suspense } from 'react'

type Params = { id: string }

// This page is fully static: no cookies, no `connection()`, no other dynamic
// data. All params are statically known via `generateStaticParams`, so the
// page is prerendered for every URL at build time. With default prefetch
// behavior, the client requests the full prerender; the response carries a
// shell byte offset (`a`) and we extract the shell prefix to cache at the
// Fallback vary path.
export async function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '124' }, { id: '125' }]
}

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <Suspense fallback={<p id="static-shell">App shell for static posts</p>}>
        <ParamsDependent params={params} />
      </Suspense>
    </main>
  )
}

async function ParamsDependent({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return <p id="static-content">{`Static post ${id}`}</p>
}
