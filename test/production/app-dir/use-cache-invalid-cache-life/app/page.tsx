import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache'
  cacheLife({ expire: NaN })

  return <p>never rendered</p>
}
