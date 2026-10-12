import { Suspense } from 'react'
import { Boundary } from '../../../../../../../components/boundary'
import { VariantControls } from '../../../../../../../components/variant-controls'

// Non-empty-shell tree of the DYNAMIC-param matrix: the same content as the
// empty-shell tree's page, but with Suspense boundaries around all param
// reads, so the route's single shell carries static content. There is NO
// generateStaticParams anywhere: no param is ever prerenderable, so the
// generic shell can never specialize — one shared entry serves every URL,
// with every param resumed per request.
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
          matrix="dynamic-param"
          tree="non-empty-shell"
          branch="without-root-param"
        />
      </Suspense>
    </Boundary>
  )
}
