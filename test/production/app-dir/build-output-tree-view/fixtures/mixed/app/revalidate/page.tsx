'use cache'

import { cacheLife } from 'next/cache'

export default async function Page() {
  cacheLife({ revalidate: 900 })

  return <p>hello world</p>
}
