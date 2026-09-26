import { Suspense } from 'react'
import { lang } from 'next/root-params'
import { cacheTag } from 'next/cache'

async function data(key: string) {
  const response = await fetch(
    `${process.env.TEST_DATA_SERVICE_URL}?key=${key}`,
    {
      cache: 'no-store',
    }
  )
  return response.text()
}

async function cachedLanguage() {
  'use cache'
  cacheTag('isolated-root-shell')
  // The data service holds this fill until the top-level consumer has joined.
  await data('joined-inner-started')
  return (await lang()).toUpperCase()
}

async function NestedConsumer() {
  'use cache'
  cacheTag('isolated-root-shell')
  return <p id="joined-nested">{await cachedLanguage()}</p>
}

async function waitForNestedFill() {
  'use cache'
  cacheTag('isolated-root-shell')
  await data('joined-top-level-ready')
}

async function releaseNestedFill() {
  'use cache'
  cacheTag('isolated-root-shell')
  await data('joined-top-level-called')
}

async function TopLevelConsumer() {
  await waitForNestedFill()
  const language = cachedLanguage()
  await releaseNestedFill()
  return <p id="joined-top-level">{await language}</p>
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<p id="joined-nested-pending">Loading nested</p>}>
        <NestedConsumer />
      </Suspense>
      <Suspense
        fallback={<p id="joined-top-level-pending">Loading top level</p>}
      >
        <TopLevelConsumer />
      </Suspense>
    </>
  )
}
