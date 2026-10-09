import { cacheLife } from 'next/cache'

export async function getUrl() {
  'use cache: remote'
  cacheLife('days')

  const url = new URL('./asset.txt', import.meta.url)
  return url.toString()
}
