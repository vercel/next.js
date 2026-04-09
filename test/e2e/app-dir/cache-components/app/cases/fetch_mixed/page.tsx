import { Suspense } from 'react'

import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page fetches using cache inside one component and without cache
        inside another component.
      </p>
      <p>Each component is wrapped in a Suspense boundary.</p>
      <p>
        With PPR this page should have a static shell that includes the cached
        fetch result and a loading state for the boundary surrounding the
        uncached fetch result.
      </p>
      <p>Without PPR this page should be dynamic.</p>
      <Suspense fallback="loading...">
        <ComponentOne />
      </Suspense>
      <Suspense fallback="loading too...">
        <ComponentTwo />
        <div id="inner">{getSentinelValue()}</div>
      </Suspense>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function ComponentOne() {
  return <div>message 1: {await fetchRandomCached('a')}</div>
}

async function ComponentTwo() {
  return (
    <>
      <div>message 2: {await fetchRandom('b')}</div>
      <div>message 2: {await fetchRandomCached('c')}</div>
    </>
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
