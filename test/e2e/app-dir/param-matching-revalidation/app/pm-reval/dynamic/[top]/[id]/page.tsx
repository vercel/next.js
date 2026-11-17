import { Suspense } from 'react'

export const unstable_paramMatching = {
  top: 'blocking',
  id: 'dynamic',
} as const

export function generateStaticParams() {
  return [{ top: 'a' }]
}

async function Params({
  params,
}: {
  params: Promise<{ top: string; id: string }>
}) {
  const { top, id } = await params
  return <p id="params">{`${top}/${id}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ top: string; id: string }>
}) {
  return (
    <Suspense fallback={<p id="pending">Loading</p>}>
      <Params params={params} />
    </Suspense>
  )
}
