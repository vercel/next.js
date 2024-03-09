import { unstable_cache } from 'next/cache'

export const revalidate = 0

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

      const fetchedRandomNoStore = await fetch(
        'https://next-data-api-endpoint.vercel.app/api/random',
        {
          cache: 'no-store',
        }
      ).then((res) => res.json())

      const fetchedRandomRevalidateZero = await fetch(
        'https://next-data-api-endpoint.vercel.app/api/random',
        {
          next: {
            revalidate: 0,
          },
        }
      ).then((res) => res.json())

      return {
        now: Date.now(),
        random: Math.random(),
        fetchedRandom,
        fetchedRandomNoStore,
        fetchedRandomRevalidateZero,
      }
    },
    ['random'],
    {
      tags: ['thankyounext'],
      revalidate: 10,
    }
  )()

  const cacheInner = unstable_cache(
    async () => {
      console.log('calling cacheInner')
      const data = await fetch(
        'https://next-data-api-endpoint.vercel.app/api/random?something',
        {
          next: { revalidate: 15, tags: ['thankyounext'] },
        }
      ).then((res) => res.text())
      return data
    },
    [],
    { revalidate: 360 }
  )

  const cacheOuter = unstable_cache(
    () => {
      console.log('cacheOuter')
      return cacheInner()
    },
    [],
    {
      revalidate: 1000,
      tags: ['thankyounext'],
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
      <p id="nested-cache">nested cache: {cacheOuter}</p>
    </>
  )
}
