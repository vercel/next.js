import { Suspense } from 'react'
import { connection } from 'next/server'
import { renderedAtTimestampForSlug } from '../../rendered-at'

async function RenderedAtAfterConnection({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await connection()
  const { slug } = await params
  return <p>{await renderedAtTimestampForSlug(slug)}</p>
}

export default function DynamicPeekPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={null}>
      <RenderedAtAfterConnection params={params} />
    </Suspense>
  )
}
