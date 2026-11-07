import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getItem } from '../../../lib/get-item'

export function generateStaticParams() {
  return [{ slug: 'a' }, { slug: 'b' }]
}

async function Dynamic() {
  await connection()
  return <p id="dynamic">dynamic</p>
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const item = await getItem(slug)
  if (!item) {
    redirect('/')
  }

  return (
    <>
      <h1 id="title">{item.title}</h1>
      <Suspense fallback={<p>loading</p>}>
        <Dynamic />
      </Suspense>
    </>
  )
}
