import { Suspense } from 'react'

export const unstable_matcher = {
  top: 'fallback',
  bottom: 'dynamic',
} as const

async function Params({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p id="no-example-fallback-params">{`${top}/${bottom}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  return (
    <Suspense fallback={<p id="no-example-fallback-shell">no example shell</p>}>
      <Params params={params} />
    </Suspense>
  )
}
