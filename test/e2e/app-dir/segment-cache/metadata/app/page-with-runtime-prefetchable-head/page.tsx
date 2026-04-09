import { Metadata } from 'next'
import { Suspense } from 'react'
import { cookies } from 'next/headers'

export async function generateMetadata(): Promise<Metadata> {
  await cookies()
  return {
    title: 'Runtime-prefetchable title',
  }
}

async function Content() {
  await cookies()
  return <div id="target-page">Target page</div>
}

export default function PageWithRuntimePrefetchableTitle() {
  return (
    <Suspense fallback="Loading...">
      <Content />
    </Suspense>
  )
}
