import { Suspense } from 'react'

/**
 * Layout that accesses both category and itemId params inside Suspense.
 *
 * Since this layout accesses both params, it varies on both — changing
 * either param requires re-fetching this layout segment.
 */
type Params = { category: string; itemId: string }

export default async function RuntimePrefetchLayoutSplitLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<Params>
}) {
  return (
    <div data-layout-split-layout="true">
      <Suspense fallback={<div>Loading layout...</div>}>
        <LayoutContent params={params} />
      </Suspense>
      {children}
    </div>
  )
}

async function LayoutContent({ params }: { params: Promise<Params> }) {
  const { category, itemId } = await params
  return <div data-layout-content="true">{`Layout: ${category}/${itemId}`}</div>
}
