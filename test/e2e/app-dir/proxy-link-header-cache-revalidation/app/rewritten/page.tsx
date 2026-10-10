'use cache'

import { cacheLife } from 'next/cache'

export default async function Page() {
  cacheLife('reproduction')

  return <main>Rewritten page</main>
}
