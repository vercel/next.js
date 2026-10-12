import { notFound } from 'next/navigation'
import { Suspense } from 'react'

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (slug === '404') {
    notFound()
  }

  return <p id="dynamic">Dynamic page: {slug}</p>
}

export default function DynamicPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  )
}
