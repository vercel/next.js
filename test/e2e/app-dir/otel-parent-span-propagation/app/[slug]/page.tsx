import { Suspense } from 'react'
import { connection } from 'next/server'

async function SlugContent({ params }: { params: Promise<{ slug: string }> }) {
  await connection()
  const { slug } = await params
  return <p>slug: {slug}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<p>loading...</p>}>
      <SlugContent params={params} />
    </Suspense>
  )
}
