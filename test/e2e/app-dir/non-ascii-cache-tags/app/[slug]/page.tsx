import { cacheTag, unstable_cache, updateTag } from 'next/cache'
import { connection } from 'next/server'
import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ slug: '🎉' }]
}

async function Cached({ params }: { params: Promise<{ slug: string }> }) {
  'use cache'
  const { slug } = await params
  cacheTag('🎂')
  return (
    <>
      <p id="slug">{slug}</p>
      <p>
        Cached: <span id="cached-time">{new Date().toISOString()}</span>
      </p>
    </>
  )
}

async function Dynamic() {
  await connection()

  return (
    <p>
      Dynamic: <span id="dynamic-time">{new Date().toISOString()}</span>
    </p>
  )
}

const getUnstableCached = unstable_cache(
  async () => new Date().toISOString(),
  ['unstable-cache-time'],
  { tags: ['🌶'], revalidate: false }
)

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const fetched = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    { next: { tags: ['🌮'], revalidate: false } }
  ).then((r) => r.text())

  const unstableCached = await getUnstableCached()

  return (
    <main>
      <Cached params={params} />
      <Suspense fallback={<p>Loading...</p>}>
        <Dynamic />
      </Suspense>
      <p>
        Fetched: <span id="fetched">{fetched}</span>
      </p>
      <p>
        Unstable cached: <span id="unstable-cached-time">{unstableCached}</span>
      </p>
      <form>
        <button
          id="update-tag"
          formAction={async () => {
            'use server'
            updateTag('🎂')
          }}
        >
          updateTag
        </button>
      </form>
    </main>
  )
}
