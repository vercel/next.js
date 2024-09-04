import { unstable_cache } from 'next/cache'

export const dynamic = 'force-dynamic'
export const fetchCache = 'default-cache'

const getCachedRandom = unstable_cache(
  async () => {
    return Math.random()
  },
  [],
  {
    revalidate: 3,
    tags: ['thankyounext'],
  }
)

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?a=b',
    { next: { tags: ['thankyounext'], revalidate: 3 } }
  ).then((res) => res.text())

  const cachedRandom = getCachedRandom()

  return (
    <>
      <p>hello world</p>
      <p id="data">{data}</p>
      <p id="random">{cachedRandom}</p>
    </>
  )
}
