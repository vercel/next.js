import { Suspense } from 'react'
import { ClientParams } from './params'

async function Params({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  return (
    <>
      <pre id="server-params">{JSON.stringify(slug)}</pre>
      <ClientParams />
    </>
  )
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  return (
    <Suspense fallback={null}>
      <Params params={params} />
    </Suspense>
  )
}
