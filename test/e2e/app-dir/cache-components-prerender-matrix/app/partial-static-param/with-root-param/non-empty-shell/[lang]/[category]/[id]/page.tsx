import { Suspense } from 'react'
import { Boundary } from '../../../../../../../components/boundary'
import { VariantControls } from '../../../../../../../components/variant-controls'

// Non-empty-shell variant under a root param: the same content as the
// empty-shell tree's page, but with Suspense boundaries around the non-root
// param reads (in this page and the [category] layout above), so shells
// contain static content and no empty-shell downgrade happens.
//
// `generateStaticParams` provides `lang` in every entry (required for root
// params) and partially covers `category`; `id` is never provided and must
// never resolve into a cached shell nor participate in a cache key.
//
// The page's own Boundary badge sits OUTSIDE the id Suspense boundary, so
// it belongs to the cached shell: its color is legitimately stable across
// requests, in contrast to the badge inside the deferred region.
export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'en', category: 'shoes' }]
}

async function Id({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <Boundary name={`[id] region (${id})`}>
      <div id="id">{id}</div>
    </Boundary>
  )
}

export default function Page({
  params,
}: {
  params: Promise<{ lang: string; category: string; id: string }>
}) {
  return (
    <Boundary name="page shell">
      <div id="static">static page content</div>
      <Suspense
        fallback={
          <Boundary name="[id] region (loading...)">
            <div id="id-fallback" data-fallback>
              loading id...
            </div>
          </Boundary>
        }
      >
        <Id params={params} />
      </Suspense>
      {/* The nav needs the current id, so it awaits params — it gets its
          own Suspense boundary to keep the page shell param-free. */}
      <Suspense fallback={null}>
        <VariantControls
          params={params}
          matrix="partial-static-param"
          tree="non-empty-shell"
          branch="with-root-param"
        />
      </Suspense>
    </Boundary>
  )
}
