import { Suspense } from 'react'

type Params = { id: string }

// Fully prerendered at build time: the concrete params are known via
// generateStaticParams, so a prefetch receives the concrete version and is
// never marked as a fallback.
export async function generateStaticParams() {
  return [{ id: '1' }]
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
  return <p id="static-post-content">{`Static post ${id}`}</p>
}
