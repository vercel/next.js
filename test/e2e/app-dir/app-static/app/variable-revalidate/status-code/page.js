export const revalidate = 0

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
    'https://next-data-api-endpoint.vercel.app/api/random?status=404',
    {
      next: {
        revalidate: 3,
      },
    }
  ).then(async (res) => {
    return {
      status: res.status,
      text: await res.text(),
    }
  })

  const data2 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random?status=204'
  ).then(async (res) => {
    return {
      status: res.status,
      text: await res.text(),
    }
  })

  return (
    <>
      <p id="page">/variable-revalidate/status-code</p>
      <p id="page-data">{JSON.stringify(data)}</p>
      <p id="page-data2">{JSON.stringify(data2)}</p>
    </>
  )
}
