import { Suspense } from 'react'

async function Params({
  params,
}: {
  params: Promise<{ lang: string; item: string }>
}) {
  const { lang, item } = await params
  return <p id="children">{`children:${lang}/${item}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ lang: string; item: string }>
}) {
  return (
    <Suspense fallback={<p id="children-shell">children shell</p>}>
      <Params params={params} />
    </Suspense>
  )
}
