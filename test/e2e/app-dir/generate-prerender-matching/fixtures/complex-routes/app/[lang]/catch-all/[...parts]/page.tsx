import { Suspense } from 'react'

export const experimental_paramMatching = {
  parts: 'fallback',
} as const

export function generateStaticParams() {
  return [{ parts: ['known', 'deep'] }]
}

async function Params({
  params,
}: {
  params: Promise<{ lang: string; parts: string[] }>
}) {
  const { lang, parts } = await params
  return <p id="catch-all">{`${lang}/${parts.join('/')}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ lang: string; parts: string[] }>
}) {
  return (
    <Suspense fallback={<p id="catch-all-shell">catch-all shell</p>}>
      <Params params={params} />
    </Suspense>
  )
}
