import { Suspense } from 'react'
import { connection } from 'next/server'

// `/fallback/a` is prerendered with its param. Any other slug is served from
// the fallback shell, whose param is unknown at build time.
export function generateStaticParams() {
  return [{ slug: 'a' }]
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <h1 id="heading">Fallback route</h1>
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Slug params={params} />
      </Suspense>
    </main>
  )
}

async function Slug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await connection()
  return (
    <p id="dynamic">
      Slug: {slug}, now: {Date.now()}
    </p>
  )
}
