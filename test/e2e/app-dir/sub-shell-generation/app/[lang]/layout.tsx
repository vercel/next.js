import { ReactNode, Suspense } from 'react'
import { getSentinelValue } from '../sentinel'

export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params

  return (
    <>
      <div id="lang-layout">Lang Layout: ({getSentinelValue()})</div>
      <h1>lang: {lang}</h1>
      <main>
        <Suspense fallback={<p id="loading">Loading...</p>}>
          {children}
        </Suspense>
      </main>
    </>
  )
}

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'fr' }]
}
