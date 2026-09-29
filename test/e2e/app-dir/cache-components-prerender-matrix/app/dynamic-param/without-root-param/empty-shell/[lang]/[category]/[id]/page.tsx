import { Boundary } from '../../../../../../../components/boundary'
import { VariantControls } from '../../../../../../../components/variant-controls'

// Empty-shell tree of the DYNAMIC-param matrix: there is NO
// generateStaticParams anywhere on this route, so no param is ever
// prerenderable and nothing may be completed on demand. A single shared
// entry must serve every URL of this route, with every param resumed per
// request. (There is no with-root-param branch in this matrix: root params
// without generateStaticParams are a build error.)
//
// The params are read outside of any Suspense boundary, so the only shell
// is empty and downgrades to a blocking route. `instant = false` opts the
// route out of requiring an instant shell.
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
        matrix="dynamic-param"
        tree="empty-shell"
        branch="without-root-param"
      />
    </Boundary>
  )
}
