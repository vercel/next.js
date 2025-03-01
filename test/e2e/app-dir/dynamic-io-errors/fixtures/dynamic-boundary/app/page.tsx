import { Suspense } from 'react'

import { IndirectionOne, IndirectionTwo, IndirectionThree } from './indirection'

export default async function Page() {
  return (
    <>
      <p>
        This page calls fetch three times. One is cached and outside of a
        Suspense boundary. The other two are uncached but inside Suspense
        boundaries. We expect this page to be dynamic but not produce a build
        error. If PPR is enabled we expect this page to be partially static.
        uncached.
      </p>
      <IndirectionOne>
        <FetchingComponent nonce="a" cached={true} />
      </IndirectionOne>
      <IndirectionTwo>
        <Suspense fallback={<Fallback />}>
          <FetchingComponent nonce="b" />
        </Suspense>
      </IndirectionTwo>
      <IndirectionThree>
        <Suspense fallback={<Fallback />}>
          <FetchingComponent nonce="c" />
        </Suspense>
      </IndirectionThree>
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
    <div data-message="">
      message:{' '}
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
  const response = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b=' + entropy
  )
  return response.text()
}

function Fallback() {
  return <div data-fallback="">loading...</div>
}
