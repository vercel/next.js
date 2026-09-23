import { Suspense } from 'react'

export const experimental_paramMatching = {
  top: 'blocking',
  bottom: 'dynamic',
} as const

export function generateStaticParams() {
  return [{ top: 'seed' }]
}

async function Params({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p id="params">{`${top}/${bottom}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  return (
    <>
      <p id="shell-marker">{performance.now().toFixed(5)}</p>
      <Suspense fallback={<p id="pending">waiting for params</p>}>
        <Params params={params} />
      </Suspense>
    </>
  )
}
