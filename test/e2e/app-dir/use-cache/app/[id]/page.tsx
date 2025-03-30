import { unstable_cacheLife } from 'next/cache'

async function getCachedRandom(n: number) {
  'use cache'
  unstable_cacheLife('weeks')
  return String(Math.ceil(Math.random() * n))
}

export async function generateStaticParams() {
  return [
    { id: `a${await getCachedRandom(9)}` },
    { id: `b${await getCachedRandom(2)}` },
  ]
}

export default async function Page() {
  const value = getCachedRandom(1)

  return <p>{value}</p>
}
