'use cache'

import { unstable_cacheLife } from 'next/cache'

export default async function Page() {
  unstable_cacheLife('weeks')

  return <p>hello world</p>
}
