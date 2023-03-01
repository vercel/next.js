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
      method: 'POST',
      next: {
        revalidate: 10,
      },
    }
  ).then((res) => res.text())

  const dataWithBody1 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      next: {
        revalidate: 10,
      },
    }
  ).then((res) => res.text())

  const dataWithBody2 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(JSON.stringify({ another: 'one' }))
          controller.close()
        },
      }),
      duplex: 'half',
      next: {
        revalidate: 10,
      },
    }
  ).then((res) => res.text())

  const dataWithBody3 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      body: new URLSearchParams('myParam=myValue&myParam=anotherValue'),
      next: {
        revalidate: 30,
      },
    }
  ).then((res) => res.text())

  const dataWithBody4 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      body: new URLSearchParams('myParam=myValue&myParam=anotherValue'),
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/variable-revalidate/post-method-cached</p>
      <p id="page-data">{data}</p>
      <p id="data-body1">{dataWithBody1}</p>
      <p id="data-body2">{dataWithBody2}</p>
      <p id="data-body4">{dataWithBody3}</p>
      <p id="data-body4">{dataWithBody4}</p>
    </>
  )
}
