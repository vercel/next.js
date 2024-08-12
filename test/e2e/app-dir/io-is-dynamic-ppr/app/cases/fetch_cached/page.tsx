export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page uses `fetch` with a cache option to do a cached fetches.
        Because these are cached we expect to produce a static document because
        no other dynamic IO is happening.
      </p>
      <div>message 1: {await fetchRandom('a')}</div>
      <div>message 2: {await fetchRandom('b')}</div>
      <div id="page">{process.env.__TEST_SENTINEL}</div>
    </>
  )
}

const fetchRandom = async (entropy: string) => {
  const response = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b=' + entropy,
    { cache: 'force-cache' }
  )
  return response.text()
}
