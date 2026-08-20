import { Suspense } from 'react'

export const experimental_paramMatching = {
  item: 'fallback',
} as const

async function Params({
  params,
}: {
  params: Promise<{ lang: string; item: string }>
}) {
  const { lang, item } = await params
  return <p id="right">{`right:${lang}/${item}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ lang: string; item: string }>
}) {
  return (
    <Suspense fallback={<p id="right-shell">right shell</p>}>
      <Params params={params} />
    </Suspense>
  )
}
