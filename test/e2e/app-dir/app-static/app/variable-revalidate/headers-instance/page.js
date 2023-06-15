const fetchRetry = async (url, init) => {
  for (let i = 0; i < 5; i++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      if (i === 4) {
        throw err
      }
      console.log(`Failed to fetch`, err, `retrying...`)
    }
  }
}

export default async function Page() {
  const data = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: new Headers({
        'x-hello': 'world',
      }),
      next: {
        revalidate: false,
      },
    }
  ).then((res) => res.text())

  const data2 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: new Headers({
        'x-hello': 'again',
      }),
      next: {
        revalidate: false,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/variable-revalidate/post-method-cached</p>
      <p id="page-data">{data}</p>
      <p id="page-data2">{data2}</p>
    </>
  )
}
