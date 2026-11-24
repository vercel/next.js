import { Suspense } from 'react'

async function PageContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <p id="page-dynamic-fallback">{`Dynamic fallback page: ${slug}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<p>Loading page...</p>}>
      <PageContent params={params} />
    </Suspense>
  )
}

export function generateStaticParams() {
  return [{ slug: 'built' }]
}
