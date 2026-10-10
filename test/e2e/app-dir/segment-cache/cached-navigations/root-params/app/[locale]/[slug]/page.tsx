import { locale } from 'next/root-params'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function getLocale() {
  'use cache'
  return locale()
}

async function CachedLocale() {
  'use cache'
  return <p id="cached-locale">{`Cached locale: ${await getLocale()}`}</p>
}

async function DynamicContent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await connection()
  const { slug } = await params
  return <p id="dynamic-content">{`Dynamic slug: ${slug}`}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <>
      <CachedLocale />
      <div id="dynamic-boundary">
        <Suspense fallback="Loading dynamic...">
          <DynamicContent params={params} />
        </Suspense>
      </div>
    </>
  )
}
