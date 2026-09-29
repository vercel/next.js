import { Suspense } from 'react'
import { Boundary } from '../../../../../../../components/boundary'
import { VariantControls } from '../../../../../../../components/variant-controls'

// Non-empty-shell tree of the FULLY-static-param matrix: the same content
// as the empty-shell tree's page, but with Suspense boundaries around all
// param reads. `generateStaticParams` enumerates a complete instance
// (en/shoes/1), so ALL params — including `id` — are prerenderable:
// on-demand completion may resolve everything, and fully-frozen badge
// values across requests are CORRECT here.
export async function generateStaticParams() {
  return [
    { lang: 'en' },
    { lang: 'en', category: 'shoes' },
    { lang: 'en', category: 'shoes', id: '1' },
  ]
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
          matrix="fully-static-param"
          tree="non-empty-shell"
          branch="without-root-param"
        />
      </Suspense>
    </Boundary>
  )
}
