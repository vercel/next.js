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
  return <p id="left">{`left:${lang}/${item}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ lang: string; item: string }>
}) {
  return (
    <Suspense fallback={<p id="left-shell">left shell</p>}>
      <Params params={params} />
    </Suspense>
  )
}
