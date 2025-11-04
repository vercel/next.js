import { Suspense } from 'react'

import { IndirectionOne, IndirectionTwo } from './indirection'
import { cookies } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page calls fetches eight times. Four are cached and Four are not.
        In each set of Four, two are wrapped in Suspense. This leaves two
        fetches that are uncached and not wrapped in Suspense which is
        considered an error when cacheComponents is enabled. We expect the build
        to fail with two component stacks that point to the offending IO
      </p>
      <IndirectionOne>
        <FetchingComponent nonce="a" cached={true} />
        <Suspense fallback="loading...">
          <FetchingComponent nonce="b" cached={true} />
        </Suspense>
      </IndirectionOne>
      <IndirectionTwo>
        <FetchingComponent nonce="c" />
        <Suspense fallback="loading...">
          <FetchingComponent nonce="d" />
        </Suspense>
      </IndirectionTwo>
      <FetchingComponent nonce="e" />
      <Suspense fallback="loading...">
        <FetchingComponent nonce="f" />
      </Suspense>
    </>
  )
}

async function FetchingComponent({
  nonce,
  cached,
}: {
  nonce: string
  cached?: boolean
}) {
  return (
    <div>
      message 1:{' '}
      {cached ? await fetchRandomCached(nonce) : await fetchRandom(nonce)}
    </div>
  )
}

const fetchRandomCached = async (entropy: string) => {
  const response = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b=' + entropy,
    { cache: 'force-cache' }
  )
  return response.text()
}

const fetchRandom = async (entropy: string) => {
  // Hide uncached I/O behind a runtime API call, to ensure we still get the
  // correct owner stack for the error.
  await cookies()
  const response = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b=' + entropy
  )
  // The error should point at the fetch above, and not at the following fetch.
  // FIXME: On the first load after starting the dev server that doesn't work.
  await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b=' + entropy + 'x'
  )
  return response.text()
}
