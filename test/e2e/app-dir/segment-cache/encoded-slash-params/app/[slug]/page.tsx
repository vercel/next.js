import { Suspense } from 'react'

type Params = { slug: string }

async function PageContent({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  return <div data-slug-page>{`slug=${slug}`}</div>
}

export default function SlugPage({ params }: { params: Promise<Params> }) {
  return (
    <Suspense fallback={<div data-page-loading>Loading…</div>}>
      <PageContent params={params} />
    </Suspense>
  )
}
