import { Suspense } from 'react'

export const unstable_matcher = {
  top: 'fallback',
  bottom: 'fallback',
} as const

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}

async function Bottom({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { bottom } = await params
  return <p>{bottom}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  return (
    <Suspense fallback={<p>bottom fallback</p>}>
      <Bottom params={params} />
    </Suspense>
  )
}
