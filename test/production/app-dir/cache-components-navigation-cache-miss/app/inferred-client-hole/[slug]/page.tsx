import { Suspense } from 'react'
import { ClientHole } from '../../client-hole/[slug]/client'
import { prerenderGate } from '../../prerender-gate'

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  await prerenderGate(slug)
  return (
    <>
      <p id="slug">Client-hole page</p>
      <Suspense fallback="Client loading">
        <ClientHole />
      </Suspense>
    </>
  )
}
