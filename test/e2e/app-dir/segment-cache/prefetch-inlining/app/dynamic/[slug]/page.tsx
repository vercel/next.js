import { Suspense } from 'react'

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <p id="dynamic-page">{slug}</p>
}

export default function DynamicPage({
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
