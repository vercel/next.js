'use cache'

import { unstable_cacheLife } from 'next/cache'

export default async function Page() {
  unstable_cacheLife('hours')

  return <p>hello world</p>
}
