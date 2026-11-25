import { Boundary } from '../../../../../../../components/boundary'
import { VariantControls } from '../../../../../../../components/variant-controls'

// Empty-shell tree of the FULLY-static-param matrix: `generateStaticParams`
// enumerates a complete instance (en/shoes/1), so ALL params — including
// `id` — are prerenderable. On-demand requests may complete every param,
// producing a full static prerender per URL (classic blocking-ISR
// semantics): repeated badge values across requests are CORRECT here.
//
// The params are still read outside of any Suspense boundary, so shells
// with a deferred param are empty and downgrade to blocking routes.
// `instant = false` opts the route out of requiring an instant shell.
export async function generateStaticParams() {
  return [
    { lang: 'en' },
    { lang: 'en', category: 'shoes' },
    { lang: 'en', category: 'shoes', id: '1' },
  ]
}

export const instant = false

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
      <Id params={params} />
      <VariantControls
        params={params}
        matrix="fully-static-param"
        tree="empty-shell"
        branch="without-root-param"
      />
    </Boundary>
  )
}
