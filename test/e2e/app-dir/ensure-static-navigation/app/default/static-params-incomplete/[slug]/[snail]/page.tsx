import { Suspense } from 'react'

export async function generateStaticParams() {
  return [{ slug: '123' }]
}

export const unstable_ensureStatic = 'navigation'

type Params = { slug: string; snail: string }

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <Suspense fallback={<p>Loading param data...</p>}>
        <Inner params={params} />
      </Suspense>
    </main>
  )
}

async function Inner({ params }: { params: Promise<Params> }) {
  const { slug, snail } = await params
  return (
    <p>
      Slug: {slug}, Snail: {snail}
    </p>
  )
}
