import { Suspense } from 'react'
import { Boundary } from '../../../../../../../components/boundary'
import { VariantControls } from '../../../../../../../components/variant-controls'

// The non-empty-shell variant of the fixture: the same content as the
// empty-shell tree's page, but with Suspense boundaries around all param
// reads (in this page and the segment layouts above), so every shell for
// this route contains static content and no empty-shell downgrade happens.
//
// `generateStaticParams` covers `lang` and `category` but never `id`, so `id`
// must never resolve into a cached shell and must never be part of a cache
// key: only `lang` and `category` can be completed into more specific shells.
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
          branch="without-root-param"
        />
      </Suspense>
    </Boundary>
  )
}
