import { Boundary } from '../../../../../../../components/boundary'
import { VariantControls } from '../../../../../../../components/variant-controls'

// This route intentionally produces EMPTY build-time shells: the params are
// read outside of any Suspense boundary (here and in the segment layouts
// above), so the postpone propagates to the root and none of the shells
// contain static content. `instant = false` opts the route out of requiring
// an instant (non-empty) shell.
//
// The rendered content is identical to the non-empty-shell tree's page —
// the only difference is that nothing here is wrapped in Suspense.
//
// `generateStaticParams` never provides `id`, so `id` must never be resolved
// into a cached shell and must never be part of a cache key: only `lang` and
// `category` can be completed into more specific shells on demand.
export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'en', category: 'shoes' }]
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
        matrix="partial-static-param"
        tree="empty-shell"
        branch="without-root-param"
      />
    </Boundary>
  )
}
