import { Suspense } from 'react'

export const unstable_matcher = {
  top: 'fallback',
  bottom: 'dynamic',
} as const

export function generateStaticParams() {
  return [{ top: 't1' }]
}

async function Params({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p id="dynamic-suffix-params">{`${top}/${bottom}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  return (
    <Suspense fallback={<p id="dynamic-suffix-shell">dynamic shell</p>}>
      <Params params={params} />
    </Suspense>
  )
}
