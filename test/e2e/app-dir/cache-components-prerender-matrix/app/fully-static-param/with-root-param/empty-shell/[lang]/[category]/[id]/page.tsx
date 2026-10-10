import { Boundary } from '../../../../../../../components/boundary'
import { VariantControls } from '../../../../../../../components/variant-controls'

// Empty-shell tree of the FULLY-static-param matrix, under a root param.
// The segment layouts provide `lang` and `category`, and this page's
// generateStaticParams provides `id`, so a complete instance (en/shoes/1)
// is enumerated and ALL params are prerenderable: on-demand completion may
// resolve everything, and fully-frozen badge values across requests are
// CORRECT here.
//
// The params are still read outside of any Suspense boundary, so shells
// with a deferred param are empty and downgrade to blocking routes.
// `instant = false` opts the route out of requiring an instant shell.
export async function generateStaticParams() {
  return [{ id: '1' }]
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
        branch="with-root-param"
      />
    </Boundary>
  )
}
