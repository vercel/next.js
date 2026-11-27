import { Suspense } from 'react'

async function Content({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params
  return <p id="catch-all">{slug.join('/')}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Content params={params} />
    </Suspense>
  )
}
