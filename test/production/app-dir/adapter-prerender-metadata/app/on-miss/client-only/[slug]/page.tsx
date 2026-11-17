import { Suspense } from 'react'
import { ClientHole } from '../../../combinations/client-hole'

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <main>
      <p>Client-only result: {slug}</p>
      <Suspense fallback={<p>Loading client content</p>}>
        <ClientHole />
      </Suspense>
    </main>
  )
}
