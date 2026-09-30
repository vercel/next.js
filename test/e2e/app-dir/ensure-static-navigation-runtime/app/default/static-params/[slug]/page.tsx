import { Suspense } from 'react'
import { Timestamp } from '../../../../components/timestamp'

export async function generateStaticParams() {
  return [{ slug: 'prerendered-1' }, { slug: 'prerendered-2' }]
}

export const unstable_ensureStatic = 'navigation'

type Params = { slug: string }

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <p>
        This page uses static params, and should be prerendered statically (with
        blocking prerenders for new params)
      </p>
      <Timestamp />
      <Suspense fallback={<p>Loading param data...</p>}>
        <Inner params={params} />
      </Suspense>
    </main>
  )
}

async function Inner({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  await cachedDelay(slug)
  return <p id="slug">{`Slug: ${slug}`}</p>
}

async function cachedDelay(key: string) {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 500))
  return key
}
