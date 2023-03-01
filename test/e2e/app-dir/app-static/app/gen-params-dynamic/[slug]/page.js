export async function generateStaticParams() {
  return [{ slug: 'one' }]
}

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

export default async function page({ params }) {
  const { slug } = params
  const data = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/gen-params-dynamic/[slug]</p>
      <p id="slug">{slug}</p>
      <p id="data">{data}</p>
    </>
  )
}
