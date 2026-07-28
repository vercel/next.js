import { Boundary } from '../../../../../../../components/boundary'
import { VariantControls } from '../../../../../../../components/variant-controls'

// Empty-shell variant under a root param: the params are read outside of
// any Suspense boundary (here and in the segment layouts above), so the
// postpone propagates to the root and every build-time shell is empty.
// `instant = false` opts the route out of requiring an instant (non-empty)
// shell.
//
// The rendered content is identical to the non-empty-shell tree's page —
// the only difference is that nothing here is wrapped in Suspense.
//
// The segment layouts above provide `lang` (required for root params) and
// partially cover `category` via their generateStaticParams; `id` is never
// provided, so `id` must never be resolved into a cached shell and must
// never be part of a cache key — including for requests whose `lang` value
// was not enumerated, which match the base route entry where `lang` is an
// unresolved root param.

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
        branch="with-root-param"
      />
    </Boundary>
  )
}
