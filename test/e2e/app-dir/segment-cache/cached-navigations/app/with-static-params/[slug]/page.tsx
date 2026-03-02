import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateStaticParams() {
  return [{ slug: 'foo' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <main>
      <CachedContent />
      <div id="params">
        <p>Param: {slug}</p>
      </div>
      <div id="connection-boundary">
        <Suspense fallback={<p>Loading connection...</p>}>
          <ConnectionContent />
        </Suspense>
      </div>
    </main>
  )
}

async function CachedContent() {
  'use cache'
  return <p id="cached-content">Cached content</p>
}

async function ConnectionContent() {
  await connection()
  return <p>Dynamic content</p>
}
