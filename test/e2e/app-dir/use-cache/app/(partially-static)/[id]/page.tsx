import { getCachedRandomWithCacheLife } from 'my-pkg'

export async function generateStaticParams() {
  return [
    { id: `a${await getCachedRandomWithCacheLife(9)}` },
    { id: `b${await getCachedRandomWithCacheLife(2)}` },
  ]
}

export default async function Page() {
  const value = getCachedRandomWithCacheLife(1)

  return <p>{value}</p>
}
