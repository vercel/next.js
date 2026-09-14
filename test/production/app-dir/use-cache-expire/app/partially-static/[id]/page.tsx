import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function getValue() {
  'use cache'
  cacheLife({ revalidate: 60, expire: 300 })
  return new Date().toISOString()
}

export function generateStaticParams() {
  return [{ id: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <>
      <p id="value">{await getValue()}</p>
      <Suspense fallback={<p id="dynamic">loading</p>}>
        <DynamicPart params={params} />
      </Suspense>
    </>
  )
}

async function DynamicPart({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await connection()
  return (
    <p id="dynamic">
      {id} - {new Date().toISOString()}
    </p>
  )
}
