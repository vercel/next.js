import { Suspense } from 'react'
import { connection } from 'next/server'
import { Metadata } from 'next'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ foo: string }>
}): Promise<Metadata> {
  const { foo } = await searchParams
  return {
    title: 'Dynamic Title: ' + (foo ?? '(empty)'),
  }
}

async function Content() {
  await connection()
  return <div id="page-content">Page content</div>
}

export default function PPRDisabledDynamicHead() {
  return (
    <Suspense fallback="Loading...">
      <Content />
    </Suspense>
  )
}
