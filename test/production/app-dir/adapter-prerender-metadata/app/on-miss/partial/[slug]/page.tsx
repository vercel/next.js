import { connection } from 'next/server'
import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
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
      <p>Partial result: {slug}</p>
      <Suspense fallback={<p>Loading request data</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
