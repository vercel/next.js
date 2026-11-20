import { cacheLife } from 'next/cache'

export default async function Expire() {
  'use cache'
  cacheLife({ revalidate: 60, expire: 300 })
  return null
}
