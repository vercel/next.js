import { unstable_cache } from 'next/cache'

const getData = unstable_cache(
  async () => {
    const noStore = await fetch(
      process.env.TEST_DATA_SERVER + '?cache=no-store',
      { method: 'GET', cache: 'no-store' }
    ).then((res) => res.text())

    const forceCache = await fetch(
      process.env.TEST_DATA_SERVER + '?cache=force-cache',
      { method: 'GET', cache: 'force-cache' }
    ).then((res) => res.text())

    return JSON.stringify(
      {
        random: Math.floor(Math.random() * 1000).toString(),
        data: {
          forceCache,
          noStore,
        },
      },
      null,
      2
    )
  },
  undefined,
  {
    tags: ['unstable-cache-fetch'],
  }
)

export default async function Page() {
  const data = await getData()

  return <pre id="data">{data}</pre>
}
