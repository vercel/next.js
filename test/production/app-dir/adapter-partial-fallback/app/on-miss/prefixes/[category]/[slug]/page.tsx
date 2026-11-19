import { connection } from 'next/server'
import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

async function Dynamic() {
  await connection()
  return <p>Request-specific content</p>
}

export default async function Page({
  params,
}: {
  params: Promise<{ category: string; slug: string }>
}) {
  const { category, slug } = await params
  return (
    <article>
      <p>Result: {slug}</p>
      {category === 'partial' && (
        <Suspense fallback={<p>Loading request data</p>}>
          <Dynamic />
        </Suspense>
      )}
    </article>
  )
}
