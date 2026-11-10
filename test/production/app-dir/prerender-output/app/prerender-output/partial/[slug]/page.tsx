import { Suspense } from 'react'
import { connection } from 'next/server'
import { permanentRedirect } from 'next/navigation'
import { getState } from '../../state'

export function generateStaticParams() {
  return [{ slug: 'built' }]
}

async function DynamicContent() {
  await connection()
  return <p id="dynamic">Dynamic content</p>
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const state = await getState(slug)
  if (state.startsWith('/')) {
    permanentRedirect(state)
  }
  return (
    <>
      <p id="content">{slug}</p>
      <Suspense fallback={<p>Loading dynamic content</p>}>
        <DynamicContent />
      </Suspense>
    </>
  )
}
