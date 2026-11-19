import { Suspense } from 'react'

// The reporter's catch-all root is `display: contents`, so the Fragment for
// this slot has no client rects.
async function CatchAllNavContent({
  params,
}: {
  params: Promise<{ catchAll: string[] }>
}) {
  const { catchAll } = await params
  return (
    <div style={{ display: 'contents' }}>
      <nav id="desktop-nav">Nav {catchAll.join('/')}</nav>
    </div>
  )
}

export default function CatchAllNav({
  params,
}: {
  params: Promise<{ catchAll: string[] }>
}) {
  return (
    <Suspense fallback={null}>
      <CatchAllNavContent params={params} />
    </Suspense>
  )
}
