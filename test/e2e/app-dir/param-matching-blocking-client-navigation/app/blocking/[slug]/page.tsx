import { Suspense } from 'react'

export const unstable_paramMatching = {
  slug: 'blocking',
} as const

export function generateStaticParams() {
  return [{ slug: 'seed' }]
}

async function getSlugData(slug: string) {
  'use cache'
  // Long enough that an unblocked response is flushed before this resolves.
  await new Promise((resolve) => setTimeout(resolve, 3000))
  return `ready:${slug}`
}

async function SlugData({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <p id="data">{await getSlugData(slug)}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <p id="shell">shell</p>
      <Suspense fallback={<p id="pending">awaiting-param-prerender</p>}>
        <SlugData params={params} />
      </Suspense>
    </main>
  )
}
