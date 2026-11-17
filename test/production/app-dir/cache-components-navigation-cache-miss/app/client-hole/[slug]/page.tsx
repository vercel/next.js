import { Suspense } from 'react'
import { ClientHole } from './client'
import { prerenderGate } from '../../prerender-gate'

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await params
  await prerenderGate('client-hole')
  return (
    <>
      <p id="slug">Client-hole page</p>
      <Suspense fallback="Client loading">
        <ClientHole />
      </Suspense>
    </>
  )
}
