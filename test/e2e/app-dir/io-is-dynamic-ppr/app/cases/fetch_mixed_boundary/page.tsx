import { Suspense } from 'react'

export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page fetches three values, two of which are cached but one is not.
        We expect this page to be dynamic because the one uncached fetch is
        sufficient to bail out of static generation
      </p>
      <Suspense fallback="loading...">
        <ComponentOne />
      </Suspense>
      <Suspense fallback="loading too...">
        <ComponentTwo />
      </Suspense>
      <div id="page">{process.env.__TEST_SENTINEL}</div>
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
