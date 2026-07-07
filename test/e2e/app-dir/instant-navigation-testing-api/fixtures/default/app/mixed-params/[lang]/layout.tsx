import { ReactNode } from 'react'

// `lang` IS covered by `generateStaticParams`, so it is part of the static
// shell. The layout awaits it OUTSIDE <Suspense>; under instant() the per-URL
// shell resolves the covered `lang` here (not deferred), exactly like the
// build's prebuilt `en/[slug]` shell.
export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default async function MixedLangLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  return (
    <>
      <p data-testid="mixed-lang">lang: {lang}</p>
      {children}
    </>
  )
}
