import { Suspense } from 'react'
import { ActionButton } from './client'

async function Content({ params }: { params: Promise<{ key: string }> }) {
  return <ActionButton cacheKey={(await params).key} />
}

export default function Page({ params }: { params: Promise<{ key: string }> }) {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Content params={params} />
    </Suspense>
  )
}
