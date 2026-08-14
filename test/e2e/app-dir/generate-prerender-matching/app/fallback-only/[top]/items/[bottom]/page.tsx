import { Suspense } from 'react'

export const unstable_matcher = {
  top: 'fallback',
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
  return <p id="fallback-only-params">{`${top}/${bottom}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  return (
    <Suspense fallback={<p id="fallback-only-shell">fallback shell</p>}>
      <Params params={params} />
    </Suspense>
  )
}
