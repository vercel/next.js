'use cache'

import { cacheLife } from 'next/cache'

export default async function Page() {
  cacheLife('minutes')
  return <p>Hello World</p>
}
