import type { Metadata } from 'next'
import { cacheLife } from 'next/cache'

async function getItem(id: string): Promise<{ name: string }> {
  'use cache'
  cacheLife('hours')
  throw new Error(`Failed to load item ${id}`)
}

// The item is read outside of a Suspense boundary, so the route needs to allow
// a blocking render.
export const instant = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const item = await getItem(id)
  return { title: item.name }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const item = await getItem(id)
  return <h1>{item.name}</h1>
}
