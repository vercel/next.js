import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateStaticParams() {
  return [{ slug: 'no-cookies' }]
}

type Params = { slug: string }

export default async function Page({ params }: { params: Promise<Params> }) {
  if (workUnitAsyncStorage.getStore()!.type === 'prerender') {
    console.log('Prerendering page')
  }
  return (
    <main>
      <p id="page-content">maybe-runtime-shell page shell text</p>
      <Suspense>
        <UseCookiesWhenInISR />
      </Suspense>

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

async function UseCookiesWhenInISR() {
  // Use cookies in the shell during runtime ISR.
  // This simulates a page whose shell was static at build
  // but switched to a runtime shell after a revalidation.
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    await cookies()
    return <p id="maybe-runtime-content">Runtime data used in shell: true</p>
  } else {
    return <p id="maybe-runtime-content">Runtime data used in shell: false</p>
  }
}

async function ParamsDependent({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  return (
    <div>
      <p id="param-value">{`Slug: ${slug}`}</p>
    </div>
  )
}

async function DynamicContent() {
  await connection()
  return <p id="dynamic-content">Dynamic content</p>
}
