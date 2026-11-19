import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ slug: 'not-found' }, { slug: 'partial' }]
}

async function Dynamic() {
  await connection()
  return <p>Dynamic content</p>
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (slug === 'not-found') {
    notFound()
  }
  return (
    <main>
      <p>{slug}</p>
      <Suspense fallback={<p>Loading</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
