import { Suspense } from 'react'

export const unstable_paramMatching = { slug: 'fallback' } as const

export function generateStaticParams() {
  return []
}

async function Slug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <p id="slug">{slug}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Slug params={params} />
    </Suspense>
  )
}
