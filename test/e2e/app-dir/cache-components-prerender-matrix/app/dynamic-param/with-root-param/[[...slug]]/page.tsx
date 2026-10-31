import { VariantControls } from '../../../../components/variant-controls'

// TOMBSTONE: dynamic-param + root params is not a possible combination, but
// it IS a reachable control state in the variant switcher, so this page
// exists to explain the gap instead of 404ing.
export const instant = false

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  // Every route follows the same positional scheme —
  // /<scenario>/<root-param>/<shell>/<lang>/<category>/<id> — so the
  // catch-all receives [shell, lang, category, id]. Recover the dimensions
  // so the controls can navigate away with everything else preserved.
  const { slug = [] } = await params
  const [tree = 'empty-shell', lang = 'fr', category = 'toys', id = '1'] = slug

  return (
    <main style={{ fontFamily: 'monospace', lineHeight: 1.8, padding: 16 }}>
      <h1>this combination cannot exist</h1>
      <p>
        You have selected the <strong>dynamic-param</strong> matrix with{' '}
        <strong>root params</strong> enabled — a combination that is not
        actually possible in a Next.js app:
      </p>
      <ul>
        <li>
          the dynamic-param matrix has no <code>generateStaticParams</code>{' '}
          anywhere (that is its defining property), and
        </li>
        <li>
          root params are required to be provided by{' '}
          <code>generateStaticParams</code> — the build fails with &quot;A
          required root parameter was not provided&quot; if a root param has no
          enumerated value, because the document itself varies by a root param
          and there is no mechanism to defer it.
        </li>
      </ul>
      <p>
        So a route whose root layout lives inside a param segment must enumerate
        at least one value for that param, which would make it the
        partial-static-param (or fully-static-param) matrix. Uncheck{' '}
        <em>root params</em> or switch matrices to return to a real page.
      </p>
      <VariantControls
        params={Promise.resolve({ lang, category, id })}
        matrix="dynamic-param"
        tree={tree}
        branch="with-root-param"
      />
    </main>
  )
}
