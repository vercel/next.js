import { Suspense } from 'react'
import { connection } from 'next/server'
import { Thrower } from '../thrower'

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense>
      <PageImpl params={params} />
    </Suspense>
  )
}

let hasThrown = false

async function PageImpl({ params }: { params: Promise<{ slug: string }> }) {
  await connection()
  const { slug } = await params

  if (!hasThrown) {
    hasThrown = true
    return <Thrower shouldThrow={true} />
  }

  return (
    <>
      <p id="recover">Recovered</p>
      <p id="slug">{slug}</p>
    </>
  )
}
