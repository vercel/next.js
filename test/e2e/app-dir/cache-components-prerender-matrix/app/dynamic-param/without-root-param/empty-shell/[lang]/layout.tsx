import { Boundary } from '../../../../../components/boundary'

// Reads `lang` with NO Suspense boundary (the empty-shell tree's
// convention): whenever `lang` is deferred, the postpone propagates to the
// root and the shell stays empty. The rendered content is identical to the
// non-empty-shell tree's [lang] layout — the only difference is the missing
// Suspense boundary.
export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
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
