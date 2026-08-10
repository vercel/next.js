import { cacheTag } from 'next/cache'

async function getCachedValue() {
  'use cache: custom'
  cacheTag('custom-tag')
  return Date.now().toString()
}

export default async function Page() {
  const value = await getCachedValue()

  return <div id="revalidate-target">{value}</div>
}
