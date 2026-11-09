import { Suspense } from 'react'

export const unstable_paramMatching = { slug: 'not-found' } as const

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  return <p id="matched">Matched: {(await params).slug}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content params={params} />
    </Suspense>
  )
}
