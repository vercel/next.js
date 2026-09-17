import { Suspense } from 'react'

export const experimental_paramMatching = {
  top: 'blocking',
  bottom: 'fallback',
} as const

async function Params({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p id="no-example-blocking-fallback-params">{`${top}/${bottom}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  return (
    <Suspense
      fallback={<p id="no-example-blocking-fallback-shell">no example shell</p>}
    >
      <Params params={params} />
    </Suspense>
  )
}
