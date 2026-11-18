import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}

async function Params({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p id="inferred-full-params">{`${top}/${bottom}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  return (
    <Suspense fallback={<p id="inferred-full-shell">inferred full shell</p>}>
      <Params params={params} />
    </Suspense>
  )
}
