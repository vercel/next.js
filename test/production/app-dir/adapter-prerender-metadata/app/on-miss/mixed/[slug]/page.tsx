import { connection } from 'next/server'
import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ slug: 'static' }, { slug: 'partial' }]
}

async function Dynamic() {
  await connection()
  return <p>Request-specific content</p>
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <main>
      <p>Mixed result: {slug}</p>
      {slug === 'partial' && (
        <Suspense fallback={<p>Loading request data</p>}>
          <Dynamic />
        </Suspense>
      )}
    </main>
  )
}
