'use cache'

import { unstable_navigation } from 'next/cache'

export async function CachedWithNavigation() {
  await unstable_navigation()
  return <p id="not-included-in-prefetch">Not included in prefetch</p>
}
