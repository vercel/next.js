import { ReactNode } from 'react'
import { setTimeout } from 'timers/promises'

export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params

  if (lang === 'en') {
    // Simulate uncached I/O. This should lead to a build-time error, because we
    // expect a fallback shell to be generated for /en/[slug]. It would be a
    // prerender error at runtime if we tried to generate a route shell at
    // runtime for /en/foo instead.
    await setTimeout(100)
  }

  return (
    <>
      <h1>lang: {lang}</h1>
      <main>{children}</main>
    </>
  )
}

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'fr' }]
}
