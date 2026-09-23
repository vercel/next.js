import { Suspense } from 'react'

export const experimental_paramMatching = { parts: 'blocking' } as const

async function Content({
  params,
}: {
  params: Promise<{ lang: string; parts: string[] }>
}) {
  const { lang, parts } = await params
  return <p id="params">{`${lang}/${parts.join('/')}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ lang: string; parts: string[] }>
}) {
  return (
    <main id="docs-page">
      <h1>Documentation</h1>
      <Suspense fallback={<p>Loading documentation</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  )
}
