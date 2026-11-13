import { cacheLife } from 'next/cache'

export const ensureStatic = 'navigation'

async function value() {
  'use cache'
  cacheLife({ stale: 60, revalidate: 300, expire: 600 })
  return 'Per-page navigation assertion'
}

export default async function Page() {
  return <p id="assertion">{await value()}</p>
}
