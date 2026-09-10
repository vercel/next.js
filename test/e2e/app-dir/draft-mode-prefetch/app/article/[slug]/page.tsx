import { draftMode } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { isEnabled } = await draftMode()

  return (
    <>
      <p id="target-content">
        {`${isEnabled ? 'Draft' : 'Published'} content: ${slug}`}
      </p>
      <Suspense fallback={<p>Loading dynamic content...</p>}>
        <DynamicContent />
      </Suspense>
    </>
  )
}

async function DynamicContent() {
  await connection()
  return <p id="dynamic-content">Dynamic content</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<p>Loading target content...</p>}>
      <Content params={params} />
    </Suspense>
  )
}
