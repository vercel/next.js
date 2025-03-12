'use cache'

import { unstable_cacheLife } from 'next/cache'

export default async function Page() {
  unstable_cacheLife({ revalidate: 412, expire: 8940 })

  return <p>hello world</p>
}
