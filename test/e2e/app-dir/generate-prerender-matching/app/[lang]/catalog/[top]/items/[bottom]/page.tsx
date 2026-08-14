import { Suspense } from 'react'

export async function unstable_generateMatcher() {
  return {
    top: 'blocking',
    bottom: 'fallback',
  } as const
}

export function generateStaticParams() {
  return [
    { lang: 'en', top: 't1', bottom: 'b1' },
    { lang: 'es', top: 't1', bottom: 'b1' },
  ]
}

async function Params({
  params,
}: {
  params: Promise<{ lang: string; top: string; bottom: string }>
}) {
  const { lang, top, bottom } = await params
  return <p id="catalog-params">{`${lang}/${top}/${bottom}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ lang: string; top: string; bottom: string }>
}) {
  return (
    <Suspense fallback={<p id="catalog-shell">catalog shell</p>}>
      <Params params={params} />
    </Suspense>
  )
}
