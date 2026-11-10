import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateStaticParams() {
  return [
    { slug: 'no-cookies-in-prefetch' },
    { slug: 'no-cookies-in-prefetch-2' },
    { slug: 'yes-cookies-in-prefetch' },
  ]
}

function shouldUseRuntimeDataForSlug(slug: string) {
  return !slug.includes('no-cookies')
}

type Params = { slug: string }

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <p id="page-content">maybe-runtime-prefetch page shell text</p>
      <Suspense fallback={<p id="param-loading">Loading param content...</p>}>
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
  return (
    <div>
      <p id="param-content">{`Slug: ${slug}`}</p>
      <Suspense
        fallback={
          <p id="maybe-runtime-content-fallback">Loading runtime data...</p>
        }
      >
        <ConditionalCookiesUse slug={slug} />
      </Suspense>
    </div>
  )
}

async function ConditionalCookiesUse({ slug }: { slug: string }) {
  const shouldUseRuntimeData = shouldUseRuntimeDataForSlug(slug)
  if (shouldUseRuntimeData) {
    await cookies()
  }
  return (
    <p id="maybe-runtime-content">{`Runtime data accessed on ${slug}: ${shouldUseRuntimeData}`}</p>
  )
}

async function DynamicContent() {
  await connection()
  return <p id="dynamic-content">Dynamic content</p>
}
