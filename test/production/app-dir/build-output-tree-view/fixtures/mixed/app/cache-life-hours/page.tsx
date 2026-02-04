'use cache'

import { cacheLife } from 'next/cache'

export default async function Page() {
  cacheLife('hours')

  return <p>hello world</p>
}
