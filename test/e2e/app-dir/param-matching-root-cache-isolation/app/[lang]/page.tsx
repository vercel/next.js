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

async function sharedContent() {
  'use cache'
  cacheTag('isolated-root-shell')
  return data('shared')
}

async function cachedLanguage() {
  'use cache'
  cacheTag('isolated-root-shell')
  await data('before-language')
  const language = lang().then((value) => value.toUpperCase())
  // Signal that the root promise was consumed, not just created. The test data
  // service keeps the independent fill pending until this access has happened.
  await data('language-read')
  return language
}

async function RootDependent() {
  'use cache'
  // Start the independent fill inside the cache that will be cancelled. It
  // must survive that cancellation for a different consumer to use its result.
  const shared = sharedContent()
  const language = await cachedLanguage()
  return <p id="localized">{language + ':' + (await shared)}</p>
}

async function IndependentConsumer() {
  'use cache'
  await data('independent-consumer')
  return <p id="independent">{await sharedContent()}</p>
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<p id="localized-pending">Loading language</p>}>
        <RootDependent />
      </Suspense>
      <Suspense
        fallback={<p id="independent-pending">Loading shared content</p>}
      >
        <IndependentConsumer />
      </Suspense>
    </>
  )
}
