import { Suspense } from 'react'

type Params = { slug: string }

async function ItemContent({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  return (
    <div id="in-page-loading-boundary-content">
      <div data-slug={slug}>Item: {slug}</div>
    </div>
  )
}

export default function InPageLoadingBoundaryPage({
  params,
}: {
  params: Promise<Params>
}) {
  return (
    <div id="in-page-loading-boundary-page">
      <Suspense fallback={<div data-loading="true">Loading item...</div>}>
        <ItemContent params={params} />
      </Suspense>
    </div>
  )
}
