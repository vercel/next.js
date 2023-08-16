import { unstable_cache } from 'next/cache'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?page',
    {
      next: { revalidate: 360, tags: ['thankyounext'] },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?a=b',
    {
      next: { revalidate: 360, tags: ['thankyounext', 'justputit'] },
    }
  ).then((res) => res.text())

  const cachedData = await unstable_cache(
    async () => {
      const fetchedRandom = await fetch(
        'https://next-data-api-endpoint.vercel.app/api/random'
      ).then((res) => res.json())
      return {
        now: Date.now(),
        random: Math.random(),
        fetchedRandom,
      }
    },
    ['random'],
    {
      tags: ['thankyounext', 'unstable_cache_tag1'],
      revalidate: 10,
    }
  )()

  return (
    <>
      <p id="page">/variable-revalidate/revalidate-360</p>
      <p id="page-data">revalidate 360 (tags: thankyounext): {data}</p>
      <p id="page-data2">
        revalidate 360 (tags: thankyounext, justputit): {data2}
      </p>
      <p id="page-data3">
        revalidate 10 (tags: thankyounext): {JSON.stringify(cachedData)}
      </p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
