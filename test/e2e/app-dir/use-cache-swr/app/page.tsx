import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

async function getInnerData(id: string) {
  'use cache'

  await setTimeout(1000)

  return new Date().toISOString()
}

async function getOuterData(id: string) {
  'use cache'

  cacheLife({ revalidate: 5 })

  console.log('use-cache-swr: generating outer data')

  const innerData = await getInnerData('inner')

  return { outer: new Date().toISOString(), inner: innerData }
}

export default async function Page() {
  await connection()

  const data = await getOuterData('outer')

  return (
    <main>
      <p id="outer-data">{data.outer}</p>
      <p id="inner-data">{data.inner}</p>
    </main>
  )
}
