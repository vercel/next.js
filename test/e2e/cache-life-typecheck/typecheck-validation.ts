import { cacheLife, unstable_cacheLife } from 'next/cache'

export function validate() {
  cacheLife('blog')
  cacheLife('minutes')
  cacheLife({ stale: 30, revalidate: 60, expire: 120 })
  unstable_cacheLife('blog')

  // @ts-expect-error unknown profile
  cacheLife('bogus')
  // @ts-expect-error unknown profile
  unstable_cacheLife('bogus')
}
