import { Suspense } from 'react'

export const experimental_paramMatching = {
  bottom: 'fallback',
} as const

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}

async function Params({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p id="inferred-hole-fallback-params">{`${top}/${bottom}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  return (
    <Suspense
      fallback={<p id="inferred-hole-fallback-shell">waiting for params</p>}
    >
      <Params params={params} />
    </Suspense>
  )
}
