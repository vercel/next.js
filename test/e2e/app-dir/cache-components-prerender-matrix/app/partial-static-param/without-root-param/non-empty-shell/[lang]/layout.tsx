import { Suspense, type ReactNode } from 'react'
import { Boundary } from '../../../../../components/boundary'

// Reads `lang` in its own Suspense boundary (the non-empty-shell tree's
// convention): shells where `lang` is concrete render it statically, and
// generic shells show the fallback. The rendered content is identical to
// the empty-shell tree's [lang] layout — the only difference is the
// Suspense boundary.
async function LayoutImpl({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params

  return (
    <Boundary name={`[lang] layout (${lang})`}>
      <div id="lang">{lang}</div>
      {children}
    </Boundary>
  )
}

export default function Layout(props: {
  children: ReactNode
  params: Promise<{ lang: string }>
}) {
  return (
    <Suspense
      fallback={
        <Boundary name="[lang] layout (loading...)">
          <div data-fallback>loading lang...</div>
        </Boundary>
      }
    >
      <LayoutImpl {...props} />
    </Suspense>
  )
}
