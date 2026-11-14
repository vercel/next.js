import { Suspense } from 'react'
import { connection } from 'next/server'

export const instant = false

async function Content({
  params,
}: {
  params: Promise<{ tenant: string; slug?: string[] }>
}) {
  await connection()
  const { tenant, slug = [] } = await params
  return <h1>{`${tenant}/${slug.join('/')}`}</h1>
}

export default function Page({
  params,
}: {
  params: Promise<{ tenant: string; slug?: string[] }>
}) {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Content params={params} />
    </Suspense>
  )
}
