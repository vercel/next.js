import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page renders two components each performing one or more cached
        fetches. There is no uncached IO in this example
      </p>
      <p>Niether component is wrapped in a Suspense boundary.</p>
      <p>With PPR this page should be entirely static.</p>
      <p>Without PPR this page should be static.</p>
      <ComponentOne />
      <ComponentTwo />
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
      <div>message 2: {await fetchRandomCached('b')}</div>
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
