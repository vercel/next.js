import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateStaticParams() {
  return [{ slug: 'one' }, { slug: 'two' }]
}

type Params = { slug: string }

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <p id="page-content">Speculative-static-param page shell text</p>
      <Suspense fallback={<p id="slug-loading">Loading param content...</p>}>
        <ParamsDependent params={params} />
      </Suspense>
      <Suspense
        fallback={<p id="dynamic-loading">Loading dynamic content...</p>}
      >
        <DynamicContent />
      </Suspense>
    </main>
  )
}

async function ParamsDependent({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  return <p id="slug-content">{`Slug: ${slug}`}</p>
}

async function DynamicContent() {
  await connection()
  return <p id="dynamic-content">Dynamic content</p>
}
