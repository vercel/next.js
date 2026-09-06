import { Suspense } from 'react'

// Non-empty-shell variant under a root param: static page content plus
// Suspense boundaries around the non-root param reads, so shells contain
// static content and no empty-shell downgrade happens.
//
// `generateStaticParams` provides `lang` in every entry (required for root
// params) and partially covers `category`; `id` is never provided and must
// never resolve into a cached shell nor participate in a cache key.
export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'en', category: 'shoes' }]
}

async function Id({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Per-render marker (prerenderable), read after `await params` so it
  // belongs to the deferred region: it must be re-rendered (resumed) per
  // request and never repeat across fetches.
  const renderedAt = performance.now()

  return (
    <>
      <div id="id">{id}</div>
      <div id="rendered-at">{renderedAt}</div>
    </>
  )
}

export default function Page({
  params,
}: {
  params: Promise<{ lang: string; category: string; id: string }>
}) {
  return (
    <div>
      <div id="static">static page content</div>
      <Suspense
        fallback={
          <div id="id-fallback" data-fallback>
            loading id...
          </div>
        }
      >
        <Id params={params} />
      </Suspense>
    </div>
  )
}
