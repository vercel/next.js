import { Suspense } from 'react'

export const unstable_matcher = {
  lang: 'blocking',
  top: 'fallback',
  bottom: 'dynamic',
} as const

export function generateStaticParams() {
  return [{ lang: 'en', top: 't1' }]
}

async function Params({
  params,
}: {
  params: Promise<{ lang: string; top: string; bottom: string }>
}) {
  const { lang, top, bottom } = await params
  return <p id="preview-params">{`${lang}/${top}/${bottom}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ lang: string; top: string; bottom: string }>
}) {
  return (
    <Suspense fallback={<p id="preview-shell">preview shell</p>}>
      <Params params={params} />
    </Suspense>
  )
}
