import { Suspense } from 'react'
import { connection } from 'next/server'
import { readSharedValue } from '../data'

async function Content({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>
}) {
  await connection()
  const { id } = await searchParams
  if (typeof id !== 'string') {
    throw new Error('Expected a single id search parameter')
  }
  return <p id="shared-write-producer">{await readSharedValue(id)}</p>
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>
}) {
  return (
    <Suspense fallback={<p>Loading producer</p>}>
      <Content searchParams={searchParams} />
    </Suspense>
  )
}
