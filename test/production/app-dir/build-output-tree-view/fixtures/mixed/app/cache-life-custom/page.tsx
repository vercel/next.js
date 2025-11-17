'use cache'

import { cacheLife } from 'next/cache'

export default async function Page() {
  cacheLife({ revalidate: 412, expire: 8940 })

  return <p>hello world</p>
}
