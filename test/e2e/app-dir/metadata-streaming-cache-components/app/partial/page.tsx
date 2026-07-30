import { Suspense } from 'react'
import { connection } from 'next/server'

async function Dynamic({
  searchParams,
}: {
  searchParams: Promise<{ stream?: string }>
}) {
  await connection()

  const stream = (await searchParams).stream
  if (stream === '1') {
    await new Promise<never>(() => {})
  } else if (stream === 'delay') {
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return <p id="dynamic-content">dynamic content</p>
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ stream?: string }>
}) {
  return (
    <div>
      <h1 id="static-content">static shell</h1>
      <Suspense fallback={<p id="dynamic-fallback">dynamic fallback</p>}>
        <Dynamic searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

export async function generateMetadata() {
  await connection()
  return {
    title: 'dynamic title',
  }
}
