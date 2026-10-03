import { Suspense } from 'react'
import { connection } from 'next/server'

export async function generateStaticParams() {
  return [{ slug: 'one' }]
}

async function DynamicContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await connection()
  return <p id="placeholder-resume">Page {slug}</p>
}

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <DynamicContent params={params} />
    </Suspense>
  )
}
