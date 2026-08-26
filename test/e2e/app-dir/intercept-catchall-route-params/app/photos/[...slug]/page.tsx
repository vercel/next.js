import { Suspense } from 'react'

async function Params({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  return <pre id="page">{JSON.stringify(slug)}</pre>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  return (
    <Suspense fallback={null}>
      <Params params={params} />
    </Suspense>
  )
}
